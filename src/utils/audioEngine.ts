import { PlaybackTrackInfo, SoundItem, VoiceChangerConfig } from '../types/sound';
import { DEFAULT_VOICE_CHANGER_CONFIG } from './voicePresets';
import { createPitchShifterNode, ensurePitchShifterWorklet } from './pitchWorklet';
import { getApiUrl } from './apiBase';
import { isAssetUri, loadAudioAssetDataUrl } from './audioAssetStorage';

// Prevent Chromium V8 garbage collector from terminating active mic streams
declare global {
  interface Window {
    __lir_active_mic_stream?: MediaStream | null;
    __lir_active_mic_source?: MediaStreamAudioSourceNode | null;
  }
}

class AudioEngine {
  // 1. Primary Context: Virtual Cable (Discord / Stream mixer)
  // Both Soundboard SFX AND the User's Microphone mix together here and output directly to VB-CABLE!
  private cableCtx: AudioContext | null = null;
  private cableMasterBus: GainNode | null = null;
  private cableLimiter: DynamicsCompressorNode | null = null;
  private cableEffectsGain: GainNode | null = null;
  private micGainNode: GainNode | null = null;
  private micSourceNode: MediaStreamAudioSourceNode | null = null;
  private micAnalyser: AnalyserNode | null = null;
  private micStream: MediaStream | null = null;

  // Voice Changer (Level 1 DSP Chain)
  private voiceChangerConfig: VoiceChangerConfig = { ...DEFAULT_VOICE_CHANGER_CONFIG };
  private micPostDspNode: GainNode | null = null;
  private micDryGain: GainNode | null = null;
  private micWetGain: GainNode | null = null;
  private micHpFilter: BiquadFilterNode | null = null;
  private micPitchNode: AudioWorkletNode | null = null;
  private micLpFilter: BiquadFilterNode | null = null;
  private micBassFilter: BiquadFilterNode | null = null;
  private micPresenceFilter: BiquadFilterNode | null = null;
  private micWaveShaper: WaveShaperNode | null = null;
  private micRingBypassGain: GainNode | null = null;
  private micRingModGain: GainNode | null = null;
  private micRingOsc: OscillatorNode | null = null;
  private micRingDepth: GainNode | null = null;
  private micRingSumGain: GainNode | null = null;
  private micEchoDelay: DelayNode | null = null;
  private micEchoFeedback: GainNode | null = null;
  private micEchoGain: GainNode | null = null;
  private micConvolver: ConvolverNode | null = null;
  private micReverbGain: GainNode | null = null;
  private reverbImpulseBuffer: AudioBuffer | null = null;
  private lastDistortionAmount: number = -1;
  private micMonitorDest: MediaStreamAudioDestinationNode | null = null;
  private micMonitorAudio: HTMLAudioElement | null = null;
  private isWetChainConnected: boolean = false;
  private micToCableConnected: boolean = false;

  // 2. Secondary Context: Headphones (Local Monitoring)
  // ONLY Soundboard SFX plays here (User's own voice NEVER plays in headphones unless selfMonitor is enabled)
  private monitorCtx: AudioContext | null = null;
  private monitorEffectsGain: GainNode | null = null;
  private monitorLimiter: DynamicsCompressorNode | null = null;

  // Visualizer analyser for Soundboard SFX
  private sfxAnalyser: AnalyserNode | null = null;

  // State
  private currentMicDeviceId: string = '';
  private isMicEnabled: boolean = false;
  private currentMicVolume: number = 1.0;
  private isMicConnecting: boolean = false;
  private muteMicOnPlay: boolean = true; // Auto-duck microphone during SFX playback to eliminate acoustic bleed / echo

  // Active playing sources & concurrency protection
  private activeSources: Map<string, AudioBufferSourceNode[]> = new Map();
  private activeSoundGains: Map<string, GainNode[]> = new Map();
  private allLiveSources: Set<AudioBufferSourceNode> = new Set();
  private pendingTokens: Map<string, number> = new Map();
  private currentPlayInstance: Map<string, number> = new Map();
  private tokenCounter: number = 0;
  private audioBuffers: Map<string, AudioBuffer> = new Map();
  private dataUrlBuffers: Map<string, AudioBuffer> = new Map();
  private activeTrimBounds: Map<string, { start: number; end: number }> = new Map();
  private multiSegmentActive: Set<string> = new Set();
  private multiSegmentLoopFlags: Map<string, boolean> = new Map();
  private onPlaybackStateChange?: (playingIds: string[]) => void;
  private onPlaybackDetailChange?: (tracks: PlaybackTrackInfo[]) => void;
  private currentlyPlaying: Set<string> = new Set();
  private playbackMeta: Map<string, PlaybackTrackInfo> = new Map();

  // Lir Maker local preview state (plays locally on monitorCtx only)
  private previewSources: AudioBufferSourceNode[] = [];
  private previewGain: GainNode | null = null;
  private previewSessionId: number = 0;
  private previewLoop: boolean = false;
  private previewMeta: {
    segments: Array<{
      segmentId: string;
      buffer: AudioBuffer;
      startSec: number;
      endSec: number;
      timelineStart: number;
      timelineEnd: number;
    }>;
    totalDuration: number;
    startedAtCtxTime: number;
    onEnded?: () => void;
  } | null = null;

  private primaryDeviceId: string = 'default';
  private secondaryDeviceId: string = 'default';
  private resolvedSameOutputDevice: boolean = true;
  private isPrimaryVirtualCable: boolean = false;
  private isSecondaryVirtualCable: boolean = false;
  private dualOutputEnabled: boolean = true;
  private masterVolume: number = 0.85;
  private activeRecDspUpdater: ((cfg: VoiceChangerConfig) => void) | null = null;

  // Unity gain multipliers (prevents digital clipping/distortion)
  private readonly SFX_BOOST = 1.0;
  private readonly MIC_BOOST = 1.0;

  private initContexts() {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;

    // 1. Cable Context (Main Discord mixer)
    if (!this.cableCtx) {
      this.cableCtx = new AudioCtx({ latencyHint: 'interactive' });

      // Master output bus going directly to VB-CABLE Input (Hardware Sink)
      this.cableMasterBus = this.cableCtx.createGain();
      this.cableMasterBus.gain.setValueAtTime(1.0, this.cableCtx.currentTime);

      // Studio-grade Brickwall Limiter to prevent ANY digital clipping, distortion or harsh popping
      this.cableLimiter = this.cableCtx.createDynamicsCompressor();
      this.cableLimiter.threshold.setValueAtTime(-1.0, this.cableCtx.currentTime); // -1 dBFS ceiling
      this.cableLimiter.knee.setValueAtTime(3.0, this.cableCtx.currentTime);
      this.cableLimiter.ratio.setValueAtTime(20.0, this.cableCtx.currentTime); // Strong limiting
      this.cableLimiter.attack.setValueAtTime(0.002, this.cableCtx.currentTime); // 2ms fast transient catch
      this.cableLimiter.release.setValueAtTime(0.05, this.cableCtx.currentTime); // 50ms smooth release

      this.cableMasterBus.connect(this.cableLimiter);
      this.cableLimiter.connect(this.cableCtx.destination);

      // Effects sub-bus
      this.cableEffectsGain = this.cableCtx.createGain();
      const sfxVol = Math.min(1.5, this.masterVolume * this.SFX_BOOST);
      this.cableEffectsGain.gain.setValueAtTime(sfxVol, this.cableCtx.currentTime);
      this.cableEffectsGain.connect(this.cableMasterBus);

      // Soundboard visualizer analyser
      this.sfxAnalyser = this.cableCtx.createAnalyser();
      this.sfxAnalyser.fftSize = 64;
      this.sfxAnalyser.smoothingTimeConstant = 0.8;
      this.cableEffectsGain.connect(this.sfxAnalyser);

      // Dedicated Microphone Analyser (Connected ONLY to microphone input!)
      this.micAnalyser = this.cableCtx.createAnalyser();
      this.micAnalyser.fftSize = 128;
      this.micAnalyser.smoothingTimeConstant = 0.3;
    }

    // 2. Monitor Context (Local Headphones for Dual Output)
    if (!this.monitorCtx) {
      this.monitorCtx = new AudioCtx({ latencyHint: 'interactive' });

      this.monitorEffectsGain = this.monitorCtx.createGain();
      const initialMonitorVol = this.dualOutputEnabled ? this.masterVolume : 0;
      this.monitorEffectsGain.gain.setValueAtTime(initialMonitorVol, this.monitorCtx.currentTime);

      // Monitor Limiter to protect user's ears from high peaks
      this.monitorLimiter = this.monitorCtx.createDynamicsCompressor();
      this.monitorLimiter.threshold.setValueAtTime(-1.0, this.monitorCtx.currentTime);
      this.monitorLimiter.knee.setValueAtTime(3.0, this.monitorCtx.currentTime);
      this.monitorLimiter.ratio.setValueAtTime(20.0, this.monitorCtx.currentTime);
      this.monitorLimiter.attack.setValueAtTime(0.002, this.monitorCtx.currentTime);
      this.monitorLimiter.release.setValueAtTime(0.05, this.monitorCtx.currentTime);

      this.monitorEffectsGain.connect(this.monitorLimiter);
      this.monitorLimiter.connect(this.monitorCtx.destination);
    }

    this.resumeContexts();
    this.updateSinkIds();
  }

  public resumeContexts() {
    if (this.cableCtx && this.cableCtx.state === 'suspended') {
      this.cableCtx.resume().catch(() => { });
    }
    if (this.monitorCtx && this.monitorCtx.state === 'suspended') {
      this.monitorCtx.resume().catch(() => { });
    }
  }

  public setRoutingConfig(
    primaryId: string,
    secondaryId: string,
    dualOutput: boolean,
    volume: number,
    muteMicOnPlay?: boolean
  ) {
    const nextPrimary = primaryId || 'default';
    const nextSecondary = secondaryId || 'default';
    const nextDual = dualOutput;
    const nextVol = Math.max(0, Math.min(1, volume));
    if (muteMicOnPlay !== undefined) {
      this.muteMicOnPlay = muteMicOnPlay;
    }

    const deviceChanged = this.primaryDeviceId !== nextPrimary || this.secondaryDeviceId !== nextSecondary;

    this.primaryDeviceId = nextPrimary;
    this.secondaryDeviceId = nextSecondary;
    this.dualOutputEnabled = nextDual;
    this.masterVolume = nextVol;

    this.initContexts();

    if (this.cableEffectsGain && this.cableCtx) {
      const sfxVol = Math.min(1.5, this.masterVolume * this.SFX_BOOST);
      this.cableEffectsGain.gain.setValueAtTime(sfxVol, this.cableCtx.currentTime);
    }

    if (this.monitorEffectsGain && this.monitorCtx) {
      const monitorVol = this.dualOutputEnabled ? this.masterVolume : 0;
      this.monitorEffectsGain.gain.setValueAtTime(monitorVol, this.monitorCtx.currentTime);
    }

    if (deviceChanged) {
      void this.updateSinkIds();
    }
  }

  public setMuteMicOnPlay(enabled: boolean) {
    this.muteMicOnPlay = enabled;
    this.checkAndApplyMicDucking();
  }

  private isVirtualCableOutputLabel(label: string): boolean {
    const l = label.toLowerCase();
    return (
      l.includes('cable input') ||
      l.includes('vb-audio') ||
      l.includes('voicemeeter') ||
      l.includes('virtual audio') ||
      l.includes('blackhole') ||
      l.includes('soundflower')
    );
  }

  private isLoopbackMicLabel(label: string): boolean {
    const l = label.toLowerCase();
    return (
      l.includes('cable') ||
      l.includes('voicemeeter') ||
      l.includes('stereo mix') ||
      l.includes('stereo karışımı') ||
      l.includes('what u hear') ||
      l.includes('wave out')
    );
  }

  public isPrimaryRoutedToSpeakersOnly(): boolean {
    return !this.isPrimaryVirtualCable && (!this.primaryDeviceId || this.primaryDeviceId === 'default');
  }

  public getMonitorDeviceId(): string {
    return this.secondaryDeviceId || 'default';
  }

  private async resolveOutputDeviceMetadata() {
    const primaryTarget = this.primaryDeviceId || 'default';
    const secondaryTarget = this.secondaryDeviceId || 'default';

    let sameDevice =
      primaryTarget === secondaryTarget ||
      ((!primaryTarget || primaryTarget === 'default') &&
        (!secondaryTarget || secondaryTarget === 'default'));
    let primaryVirtual = false;
    let secondaryVirtual = false;

    try {
      if (navigator.mediaDevices?.enumerateDevices) {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const outputs = devices.filter((d) => d.kind === 'audiooutput');
        const defaultOutput = outputs.find((d) => d.deviceId === 'default');
        const primaryOutput =
          outputs.find((d) => d.deviceId === primaryTarget) || defaultOutput;
        const secondaryOutput =
          outputs.find((d) => d.deviceId === secondaryTarget) || defaultOutput;

        if (primaryOutput?.label) {
          primaryVirtual = this.isVirtualCableOutputLabel(primaryOutput.label);
        }
        if (secondaryOutput?.label) {
          secondaryVirtual = this.isVirtualCableOutputLabel(secondaryOutput.label);
        }
        if (
          primaryOutput &&
          secondaryOutput &&
          primaryOutput.groupId &&
          secondaryOutput.groupId &&
          primaryOutput.groupId === secondaryOutput.groupId
        ) {
          sameDevice = true;
        }
      }
    } catch {
      // ignore enumeration failures
    }

    this.resolvedSameOutputDevice = sameDevice;
    this.isPrimaryVirtualCable = primaryVirtual;
    this.isSecondaryVirtualCable = secondaryVirtual;
  }

  private async updateSinkIds() {
    await this.resolveOutputDeviceMetadata();

    const primaryTarget = this.primaryDeviceId || 'default';
    try {
      if (this.cableCtx && 'setSinkId' in this.cableCtx) {
        const setSink = (this.cableCtx as unknown as { setSinkId: (id: string) => Promise<void> }).setSinkId;
        if (typeof setSink === 'function') {
          await setSink.call(this.cableCtx, primaryTarget);
        }
      }
    } catch (err) {
      console.warn('cableCtx.setSinkId error:', err);
    }

    const secondaryTarget = this.secondaryDeviceId || 'default';
    try {
      if (this.monitorCtx && 'setSinkId' in this.monitorCtx) {
        const setSink = (this.monitorCtx as unknown as { setSinkId: (id: string) => Promise<void> }).setSinkId;
        if (typeof setSink === 'function') {
          await setSink.call(this.monitorCtx, secondaryTarget);
        }
      }
    } catch (err) {
      console.warn('monitorCtx.setSinkId error:', err);
    }

    try {
      if (this.micMonitorAudio && 'setSinkId' in this.micMonitorAudio) {
        const setSink = (this.micMonitorAudio as unknown as { setSinkId: (id: string) => Promise<void> }).setSinkId;
        if (typeof setSink === 'function') {
          await setSink.call(this.micMonitorAudio, secondaryTarget);
        }
      }
    } catch (err) {
      console.warn('micMonitorAudio.setSinkId error:', err);
    }

    this.syncMicCableConnection();
    this.syncMicMonitor();
  }

  private createDistortionCurve(amount: number): Float32Array<ArrayBuffer> {
    const samples = 2048;
    const buffer = new ArrayBuffer(samples * 4);
    const curve = new Float32Array(buffer);
    if (amount <= 0.5) {
      for (let i = 0; i < samples; i++) {
        curve[i] = (i * 2) / samples - 1;
      }
      return curve;
    }

    const k = amount * 2.2;
    const deg = Math.PI / 180;
    for (let i = 0; i < samples; i++) {
      const x = (i * 2) / samples - 1;
      curve[i] = ((3 + k) * x * 20 * deg) / (Math.PI + k * Math.abs(x));
    }
    return curve;
  }

  private getOrCreateReverbImpulse(ctx: AudioContext): AudioBuffer {
    if (this.reverbImpulseBuffer && this.reverbImpulseBuffer.sampleRate === ctx.sampleRate) {
      return this.reverbImpulseBuffer;
    }
    const duration = 1.45;
    const length = Math.floor(ctx.sampleRate * duration);
    const impulse = ctx.createBuffer(2, length, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = impulse.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < length; i++) {
        const env = Math.pow(1 - i / length, 2.6);
        const white = Math.random() * 2 - 1;
        lp = lp * 0.65 + white * 0.35;
        data[i] = lp * env * 0.75;
      }
    }
    this.reverbImpulseBuffer = impulse;
    return impulse;
  }

  public setVoiceChangerConfig(config: VoiceChangerConfig) {
    this.voiceChangerConfig = { ...config };
    this.applyVoiceChangerParams(false);
    this.activeRecDspUpdater?.(this.voiceChangerConfig);
    this.syncMicMonitor();
  }

  private setParamImmediateOrRamp(
    param: AudioParam,
    target: number,
    now: number,
    immediate: boolean,
    rampSec: number = 0.015,
  ) {
    param.cancelScheduledValues(now);
    if (immediate) {
      param.value = target;
      param.setValueAtTime(target, now);
    } else {
      param.setValueAtTime(param.value, now);
      param.linearRampToValueAtTime(target, now + rampSec);
    }
  }

  private setWetBranchConnected(connected: boolean) {
    const targetOut = this.micPostDspNode || this.micGainNode;
    if (!this.micSourceNode || !this.micHpFilter || !this.micWetGain || !targetOut) {
      return;
    }

    if (connected && !this.isWetChainConnected) {
      try {
        this.micSourceNode.connect(this.micHpFilter);
        this.micWetGain.connect(targetOut);
        this.isWetChainConnected = true;
      } catch {
        // ignore if already connected
      }
    } else if (!connected && this.isWetChainConnected) {
      try {
        this.micSourceNode.disconnect(this.micHpFilter);
      } catch { }
      try {
        this.micWetGain.disconnect(targetOut);
      } catch { }
      this.isWetChainConnected = false;
    }
  }

  private applyVoiceChangerParams(immediate: boolean = false) {
    if (!this.cableCtx || !this.micDryGain || !this.micWetGain) return;

    const now = this.cableCtx.currentTime;
    const cfg = this.voiceChangerConfig;
    const isEffectActive = Boolean(cfg.enabled) && cfg.wetMix > 0;
    const wasWetConnected = this.isWetChainConnected;

    if (!isEffectActive) {
      // Physically disconnect wet DSP graph so ZERO delay, filter, echo, or reverb can leak!
      this.setWetBranchConnected(false);
      this.setParamImmediateOrRamp(this.micDryGain.gain, 1.0, now, true);
      this.setParamImmediateOrRamp(this.micWetGain.gain, 0.0, now, true);
      if (this.micEchoFeedback) {
        this.setParamImmediateOrRamp(this.micEchoFeedback.gain, 0.0, now, true);
      }
      if (this.micEchoGain) {
        this.setParamImmediateOrRamp(this.micEchoGain.gain, 0.0, now, true);
      }
      if (this.micReverbGain) {
        this.setParamImmediateOrRamp(this.micReverbGain.gain, 0.0, now, true);
      }
      if (this.micRingDepth && this.micRingBypassGain) {
        this.setParamImmediateOrRamp(this.micRingDepth.gain, 0.0, now, true);
        this.setParamImmediateOrRamp(this.micRingBypassGain.gain, 1.0, now, true);
      }
      if (this.micPitchNode) {
        const pitchParam = this.micPitchNode.parameters.get('semitones');
        if (pitchParam) {
          this.setParamImmediateOrRamp(pitchParam, 0.0, now, true);
        }
      }
      return;
    }

    // Transitioning from bypassed -> active: snap gains to exact initial values before connecting
    const snapParams = immediate || !wasWetConnected;

    const rawWet = Math.max(0, Math.min(1, cfg.wetMix));
    const wet = rawWet >= 0.99 ? 1 : rawWet;
    const dry = 1 - wet;

    this.setParamImmediateOrRamp(this.micDryGain.gain, dry, now, snapParams);
    this.setParamImmediateOrRamp(this.micWetGain.gain, wet, now, snapParams);

    if (this.micHpFilter) {
      this.setParamImmediateOrRamp(
        this.micHpFilter.frequency,
        Math.max(20, Math.min(1500, cfg.highpassHz)),
        now,
        snapParams,
      );
    }
    if (this.micLpFilter) {
      this.setParamImmediateOrRamp(
        this.micLpFilter.frequency,
        Math.max(600, Math.min(20000, cfg.lowpassHz)),
        now,
        snapParams,
      );
    }
    if (this.micBassFilter) {
      this.setParamImmediateOrRamp(
        this.micBassFilter.gain,
        Math.max(-14, Math.min(16, cfg.bassBoostDb)),
        now,
        snapParams,
      );
    }
    if (this.micPresenceFilter) {
      this.setParamImmediateOrRamp(
        this.micPresenceFilter.gain,
        Math.max(-10, Math.min(14, cfg.clarityBoostDb)),
        now,
        snapParams,
      );
    }
    if (this.micPitchNode) {
      const pitchParam = this.micPitchNode.parameters.get('semitones');
      if (pitchParam) {
        this.setParamImmediateOrRamp(
          pitchParam,
          Math.max(-12, Math.min(12, cfg.pitchSemitones ?? 0)),
          now,
          snapParams,
          0.02,
        );
      }
    }
    if (this.micWaveShaper) {
      const dist = Math.max(0, Math.min(100, cfg.distortionAmount));
      this.micWaveShaper.oversample = dist > 0.5 ? '2x' : 'none';
      if (Math.abs(dist - this.lastDistortionAmount) >= 0.5) {
        this.micWaveShaper.curve = this.createDistortionCurve(dist);
        this.lastDistortionAmount = dist;
      }
    }

    const ringActive = cfg.ringModHz > 0 && cfg.ringModMix > 0;
    const ringMix = ringActive ? Math.max(0, Math.min(1, cfg.ringModMix)) : 0;
    if (this.micRingBypassGain && this.micRingDepth && this.micRingOsc) {
      this.setParamImmediateOrRamp(this.micRingBypassGain.gain, 1 - ringMix, now, snapParams);
      this.setParamImmediateOrRamp(this.micRingDepth.gain, ringMix, now, snapParams);
      this.setParamImmediateOrRamp(
        this.micRingOsc.frequency,
        Math.max(10, Math.min(240, cfg.ringModHz || 45)),
        now,
        snapParams,
      );
    }

    if (this.micEchoDelay && this.micEchoFeedback && this.micEchoGain) {
      const echoActive = cfg.echoDelayMs > 0 && cfg.echoMix > 0;
      this.setParamImmediateOrRamp(
        this.micEchoDelay.delayTime,
        Math.max(0.01, Math.min(0.6, (cfg.echoDelayMs || 100) / 1000)),
        now,
        snapParams,
        0.02,
      );
      this.setParamImmediateOrRamp(
        this.micEchoFeedback.gain,
        echoActive ? Math.max(0, Math.min(0.75, cfg.echoFeedback)) : 0,
        now,
        snapParams,
        0.02,
      );
      this.setParamImmediateOrRamp(
        this.micEchoGain.gain,
        echoActive ? Math.max(0, Math.min(0.9, cfg.echoMix)) : 0,
        now,
        snapParams,
        0.02,
      );
    }

    if (this.micReverbGain) {
      this.setParamImmediateOrRamp(
        this.micReverbGain.gain,
        Math.max(0, Math.min(0.95, cfg.reverbMix)),
        now,
        snapParams,
        0.02,
      );
    }

    this.setWetBranchConnected(true);
  }

  private syncMicCableConnection() {
    if (!this.micGainNode || !this.cableMasterBus) {
      this.micToCableConnected = false;
      return;
    }

    // Never route live microphone into "default" system speakers/headphones unless
    // the default playback device itself is a virtual cable (prevents hearing yourself & echo loop)!
    const shouldRouteToCable =
      this.isMicEnabled &&
      (this.isPrimaryVirtualCable ||
        (Boolean(this.primaryDeviceId) && this.primaryDeviceId !== 'default'));

    if (shouldRouteToCable && !this.micToCableConnected) {
      try {
        this.micGainNode.connect(this.cableMasterBus);
        this.micToCableConnected = true;
      } catch {
        // already connected
      }
    } else if (!shouldRouteToCable && this.micToCableConnected) {
      try {
        this.micGainNode.disconnect(this.cableMasterBus);
      } catch { }
      this.micToCableConnected = false;
    }
  }

  private syncMicMonitor() {
    if (!this.cableCtx || !this.micGainNode || !this.isMicEnabled) {
      this.teardownMicMonitor();
      return;
    }

    // Only play mic monitor in headphones when user explicitly turns selfMonitor ON
    // AND secondary device is not a virtual cable (never loop back into VB-CABLE).
    if (!this.voiceChangerConfig.selfMonitor || this.isSecondaryVirtualCable) {
      this.teardownMicMonitor();
      return;
    }

    if (!this.micMonitorDest) {
      this.micMonitorDest = this.cableCtx.createMediaStreamDestination();
      this.micGainNode.connect(this.micMonitorDest);
    }

    if (!this.micMonitorAudio) {
      const audioEl = new Audio();
      audioEl.autoplay = true;
      audioEl.srcObject = this.micMonitorDest.stream;
      this.micMonitorAudio = audioEl;

      const secondaryTarget = this.secondaryDeviceId || 'default';
      if ('setSinkId' in audioEl) {
        const setSink = (audioEl as unknown as { setSinkId: (id: string) => Promise<void> }).setSinkId;
        if (typeof setSink === 'function') {
          void setSink.call(audioEl, secondaryTarget).catch(() => {});
        }
      }
      void audioEl.play().catch(() => {});
    }
  }

  private teardownMicMonitor() {
    if (this.micMonitorAudio) {
      try {
        this.micMonitorAudio.pause();
        this.micMonitorAudio.srcObject = null;
      } catch { }
      this.micMonitorAudio = null;
    }
    if (this.micMonitorDest && this.micGainNode) {
      try {
        this.micGainNode.disconnect(this.micMonitorDest);
      } catch { }
    }
    this.micMonitorDest = null;
  }

  // Smooth microphone ducking to completely eradicate acoustic echo / headset bleed into the microphone
  private updateMicGain(isDucked: boolean = false) {
    if (!this.micGainNode || !this.cableCtx) return;
    const targetVolume = isDucked ? 0.0 : this.currentMicVolume * this.MIC_BOOST;
    try {
      this.micGainNode.gain.cancelScheduledValues(this.cableCtx.currentTime);
      this.micGainNode.gain.setTargetAtTime(targetVolume, this.cableCtx.currentTime, 0.015);
    } catch {
      this.micGainNode.gain.setValueAtTime(targetVolume, this.cableCtx.currentTime);
    }
  }

  private checkAndApplyMicDucking() {
    if (!this.isMicEnabled || !this.micGainNode) return;
    const hasActiveSFX = this.allLiveSources.size > 0;
    if (this.muteMicOnPlay && hasActiveSFX) {
      this.updateMicGain(true);
    } else {
      this.updateMicGain(false);
    }
  }

  // Real-time microphone mixing into VB-CABLE Input (Hardware Passthrough)
  public async setMicrophonePassThrough(
    enabled: boolean,
    micDeviceId?: string,
    volume: number = 1.0
  ): Promise<{ success: boolean; error?: string }> {
    this.initContexts();
    this.resumeContexts();

    const targetDeviceId = micDeviceId || 'default';
    this.currentMicVolume = volume;

    if (!enabled) {
      this.isMicEnabled = false;
      this.cleanupMicStream();
      return { success: true };
    }

    // If already active on the same device, update volume smoothly
    if (this.isMicEnabled && this.micStream && this.micStream.active && this.currentMicDeviceId === targetDeviceId) {
      this.checkAndApplyMicDucking();
      return { success: true };
    }

    if (this.isMicConnecting) {
      return { success: true };
    }
    this.isMicConnecting = true;

    this.cleanupMicStream();
    this.isMicEnabled = true;
    this.currentMicDeviceId = targetDeviceId;

    const cleanAudioConstraints: MediaTrackConstraints = {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
      sampleRate: { ideal: 48000 },
      ...({
        latency: { ideal: 0 },
        googEchoCancellation: false,
        googAutoGainControl: false,
        googNoiseSuppression: false,
        googHighpassFilter: false,
        googTypingNoiseDetection: false,
        googAudioMirroring: false,
      } as Record<string, unknown>),
    };

    try {
      const stream = await this.requestCleanMicStream(targetDeviceId, cleanAudioConstraints);

      // Activate all audio tracks
      stream.getAudioTracks().forEach((track) => {
        track.enabled = true;
      });

      this.micStream = stream;
      window.__lir_active_mic_stream = stream;

      if (!this.cableCtx || !this.cableMasterBus) {
        throw new Error('Ses mikseri hazır değil.');
      }

      // Ensure AudioContext is fully running, pitch worklet is loaded, and sink IDs are resolved
      if (this.cableCtx.state === 'suspended') {
        await this.cableCtx.resume().catch(() => { });
      }
      await Promise.all([
        this.updateSinkIds(),
        ensurePitchShifterWorklet(this.cableCtx),
      ]);

      // Create Microphone Source Node
      this.micSourceNode = this.cableCtx.createMediaStreamSource(stream);
      window.__lir_active_mic_source = this.micSourceNode;

      // Create Microphone Gain Node (Output into Analyser, VB-CABLE Bus, Optional Monitor)
      this.micGainNode = this.cableCtx.createGain();
      this.micGainNode.gain.value = this.currentMicVolume * this.MIC_BOOST;
      this.updateMicGain(false);

      this.micPostDspNode = this.cableCtx.createGain();
      this.micPostDspNode.gain.value = 1.0;

      // Build Level 1 DSP Voice Changer Chain between micSourceNode and micPostDspNode -> micGainNode
      // Initialize EVERY gain to clean silent/unity defaults BEFORE connecting!
      this.micDryGain = this.cableCtx.createGain();
      this.micDryGain.gain.value = 1.0;

      this.micWetGain = this.cableCtx.createGain();
      this.micWetGain.gain.value = 0.0;

      this.micHpFilter = this.cableCtx.createBiquadFilter();
      this.micHpFilter.type = 'highpass';
      this.micHpFilter.Q.value = 0.75;

      this.micPitchNode = createPitchShifterNode(this.cableCtx);

      this.micLpFilter = this.cableCtx.createBiquadFilter();
      this.micLpFilter.type = 'lowpass';
      this.micLpFilter.Q.value = 0.75;

      this.micBassFilter = this.cableCtx.createBiquadFilter();
      this.micBassFilter.type = 'lowshelf';
      this.micBassFilter.frequency.value = 140;

      this.micPresenceFilter = this.cableCtx.createBiquadFilter();
      this.micPresenceFilter.type = 'peaking';
      this.micPresenceFilter.frequency.value = 2400;
      this.micPresenceFilter.Q.value = 1.35;

      this.micWaveShaper = this.cableCtx.createWaveShaper();
      this.micWaveShaper.oversample = 'none';
      this.lastDistortionAmount = -1;

      this.micRingBypassGain = this.cableCtx.createGain();
      this.micRingBypassGain.gain.value = 1.0;
      this.micRingModGain = this.cableCtx.createGain();
      this.micRingModGain.gain.value = 0.0;
      this.micRingOsc = this.cableCtx.createOscillator();
      this.micRingOsc.type = 'sine';
      this.micRingDepth = this.cableCtx.createGain();
      this.micRingDepth.gain.value = 0.0;
      this.micRingOsc.connect(this.micRingDepth);
      this.micRingDepth.connect(this.micRingModGain.gain);
      this.micRingOsc.start();
      this.micRingSumGain = this.cableCtx.createGain();
      this.micRingSumGain.gain.value = 1.0;

      this.micEchoDelay = this.cableCtx.createDelay(1.0);
      this.micEchoFeedback = this.cableCtx.createGain();
      this.micEchoFeedback.gain.value = 0.0;
      this.micEchoGain = this.cableCtx.createGain();
      this.micEchoGain.gain.value = 0.0;

      this.micConvolver = this.cableCtx.createConvolver();
      this.micConvolver.buffer = this.getOrCreateReverbImpulse(this.cableCtx);
      this.micReverbGain = this.cableCtx.createGain();
      this.micReverbGain.gain.value = 0.0;

      // Wire Dry Path (always connected, 100% pure 0-latency mic when Effect Engine is OFF)
      this.micSourceNode.connect(this.micDryGain);
      this.micDryGain.connect(this.micPostDspNode);
      this.micPostDspNode.connect(this.micGainNode);

      // Wire internal Wet DSP chain (source->hp and wetGain->micGainNode stay DISCONNECTED until Effect Engine is enabled!)
      if (this.micPitchNode) {
        this.micHpFilter.connect(this.micPitchNode);
        this.micPitchNode.connect(this.micLpFilter);
      } else {
        this.micHpFilter.connect(this.micLpFilter);
      }
      this.micLpFilter.connect(this.micBassFilter);
      this.micBassFilter.connect(this.micPresenceFilter);
      this.micPresenceFilter.connect(this.micWaveShaper);

      this.micWaveShaper.connect(this.micRingBypassGain);
      this.micWaveShaper.connect(this.micRingModGain);
      this.micRingBypassGain.connect(this.micRingSumGain);
      this.micRingModGain.connect(this.micRingSumGain);

      this.micRingSumGain.connect(this.micWetGain);

      this.micRingSumGain.connect(this.micEchoDelay);
      this.micEchoDelay.connect(this.micEchoFeedback);
      this.micEchoFeedback.connect(this.micEchoDelay);
      this.micEchoDelay.connect(this.micEchoGain);
      this.micEchoGain.connect(this.micWetGain);

      this.micRingSumGain.connect(this.micConvolver);
      this.micConvolver.connect(this.micReverbGain);
      this.micReverbGain.connect(this.micWetGain);

      this.isWetChainConnected = false;
      this.applyVoiceChangerParams(true);

      // Connect mic to VU Meter Analyser (Measures ONLY microphone, never soundboard!)
      if (this.micAnalyser) {
        this.micGainNode.connect(this.micAnalyser);
      }

      // Connect mic to VB-CABLE bus ONLY when primary output is a virtual cable or explicit non-default output
      this.micToCableConnected = false;
      this.syncMicCableConnection();

      this.syncMicMonitor();
      this.resumeContexts();
      this.isMicConnecting = false;
      this.checkAndApplyMicDucking();
      return { success: true };
    } catch (err) {
      console.error('Microphone passthrough error:', err);
      this.cleanupMicStream();
      this.isMicEnabled = false;
      this.isMicConnecting = false;
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Mikrofona bağlanılamadı'
      };
    }
  }

  private cleanupMicStream() {
    this.teardownMicMonitor();
    this.setWetBranchConnected(false);
    this.micToCableConnected = false;
    if (this.micRingOsc) {
      try {
        this.micRingOsc.stop();
        this.micRingOsc.disconnect();
      } catch (e) { }
      this.micRingOsc = null;
    }
    const dspNodes: Array<AudioNode | null> = [
      this.micPostDspNode,
      this.micDryGain,
      this.micWetGain,
      this.micHpFilter,
      this.micPitchNode,
      this.micLpFilter,
      this.micBassFilter,
      this.micPresenceFilter,
      this.micWaveShaper,
      this.micRingBypassGain,
      this.micRingModGain,
      this.micRingDepth,
      this.micRingSumGain,
      this.micEchoDelay,
      this.micEchoFeedback,
      this.micEchoGain,
      this.micConvolver,
      this.micReverbGain,
    ];
    for (const node of dspNodes) {
      if (node) {
        try {
          node.disconnect();
        } catch { }
      }
    }
    this.micPostDspNode = null;
    this.micDryGain = null;
    this.micWetGain = null;
    this.micHpFilter = null;
    this.micPitchNode = null;
    this.micLpFilter = null;
    this.micBassFilter = null;
    this.micPresenceFilter = null;
    this.micWaveShaper = null;
    this.micRingBypassGain = null;
    this.micRingModGain = null;
    this.micRingDepth = null;
    this.micRingSumGain = null;
    this.micEchoDelay = null;
    this.micEchoFeedback = null;
    this.micEchoGain = null;
    this.micConvolver = null;
    this.micReverbGain = null;
    this.lastDistortionAmount = -1;

    if (this.micSourceNode) {
      try {
        this.micSourceNode.disconnect();
      } catch (e) { }
      this.micSourceNode = null;
      window.__lir_active_mic_source = null;
    }
    if (this.micGainNode) {
      try {
        this.micGainNode.disconnect();
      } catch (e) { }
      this.micGainNode = null;
    }
    if (this.micStream) {
      try {
        this.micStream.getTracks().forEach((track) => {
          track.stop();
        });
      } catch (e) { }
      this.micStream = null;
      window.__lir_active_mic_stream = null;
    }
  }

  private async requestCleanMicStream(
    targetDeviceId: string,
    constraints?: MediaTrackConstraints,
  ): Promise<MediaStream> {
    const baseConstraints: MediaTrackConstraints = constraints ?? {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
      sampleRate: { ideal: 48000 },
      ...({
        latency: { ideal: 0 },
        googEchoCancellation: false,
        googAutoGainControl: false,
        googNoiseSuppression: false,
        googHighpassFilter: false,
        googTypingNoiseDetection: false,
        googAudioMirroring: false,
      } as Record<string, unknown>),
    };

    let stream: MediaStream | null = null;
    if (targetDeviceId && targetDeviceId !== 'default') {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: { ...baseConstraints, deviceId: { exact: targetDeviceId } },
        });
      } catch {
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            audio: { ...baseConstraints, deviceId: targetDeviceId },
          });
        } catch {
          try {
            stream = await navigator.mediaDevices.getUserMedia({
              audio: { ...baseConstraints, deviceId: { ideal: targetDeviceId } },
            });
          } catch { }
        }
      }
    }

    if (!stream) {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: baseConstraints,
      });
    }

    if (!stream) {
      throw new Error('Mikrofon akışı alınamadı. Lütfen mikrofon izinlerini kontrol edin.');
    }

    const openedTrack = stream.getAudioTracks()[0];
    if (openedTrack?.label && this.isLoopbackMicLabel(openedTrack.label)) {
      stream.getTracks().forEach((track) => track.stop());
      throw new Error(
        `Sanal kablo veya Stereo Karışımı ("${openedTrack.label}") mikrofon olarak seçilemez — sonsuz ses yankısı oluşturur. Lütfen fiziksel kulaklık/masaüstü mikrofonunuzu seçin.`
      );
    }

    return stream;
  }

  // Acquire a processed recording stream (captures active Voice Changer DSP & Pitch Shifter!)
  public async acquireRecordingSession(
    micDeviceId: string = 'default',
    includeVoiceEffects: boolean = true,
  ): Promise<{
    stream: MediaStream;
    analyser: AnalyserNode;
    micLabel: string;
    cleanup: () => void;
  }> {
    this.initContexts();
    this.resumeContexts();

    if (!this.cableCtx) {
      throw new Error('Ses motoru başlatılamadı.');
    }
    if (this.cableCtx.state === 'suspended') {
      await this.cableCtx.resume().catch(() => { });
    }
    await ensurePitchShifterWorklet(this.cableCtx);

    const recAnalyser = this.cableCtx.createAnalyser();
    recAnalyser.fftSize = 256;
    recAnalyser.smoothingTimeConstant = 0.72;
    const recDest = this.cableCtx.createMediaStreamDestination();
    recAnalyser.connect(recDest);

    // Case 1: Live Mic Pass-Through is already active -> tap pre-ducking processed bus directly
    if (this.isMicEnabled && this.micSourceNode && this.micPostDspNode) {
      const tapNode: AudioNode = includeVoiceEffects ? this.micPostDspNode : this.micSourceNode;
      tapNode.connect(recAnalyser);
      const trackLabel = this.micStream?.getAudioTracks()?.[0]?.label || 'Aktif Mikrofon';

      return {
        stream: recDest.stream,
        analyser: recAnalyser,
        micLabel: trackLabel,
        cleanup: () => {
          try {
            tapNode.disconnect(recAnalyser);
          } catch { }
          try {
            recAnalyser.disconnect(recDest);
          } catch { }
        },
      };
    }

    // Case 2: Mic Pass-Through is OFF -> open clean mic temporarily, process via Voice Changer DSP (never routed to speakers!)
    const tempStream = await this.requestCleanMicStream(micDeviceId);
    const tempSource = this.cableCtx.createMediaStreamSource(tempStream);

    if (!includeVoiceEffects) {
      tempSource.connect(recAnalyser);
      const trackLabel = tempStream.getAudioTracks()?.[0]?.label || 'Mikrofon';
      return {
        stream: recDest.stream,
        analyser: recAnalyser,
        micLabel: trackLabel,
        cleanup: () => {
          try {
            tempSource.disconnect();
          } catch { }
          try {
            recAnalyser.disconnect(recDest);
          } catch { }
          tempStream.getTracks().forEach((t) => t.stop());
        },
      };
    }

    const dryGain = this.cableCtx.createGain();
    dryGain.gain.value = 1.0;
    const wetGain = this.cableCtx.createGain();
    wetGain.gain.value = 0.0;

    const hp = this.cableCtx.createBiquadFilter();
    hp.type = 'highpass';
    hp.Q.value = 0.75;

    const pitchNode = createPitchShifterNode(this.cableCtx);

    const lp = this.cableCtx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 0.75;

    const bass = this.cableCtx.createBiquadFilter();
    bass.type = 'lowshelf';
    bass.frequency.value = 140;

    const presence = this.cableCtx.createBiquadFilter();
    presence.type = 'peaking';
    presence.frequency.value = 2400;
    presence.Q.value = 1.35;

    const shaper = this.cableCtx.createWaveShaper();
    let lastRecDist = -1;

    const ringBypass = this.cableCtx.createGain();
    ringBypass.gain.value = 1.0;
    const ringMod = this.cableCtx.createGain();
    ringMod.gain.value = 0.0;
    const ringOsc = this.cableCtx.createOscillator();
    ringOsc.type = 'sine';
    const ringDepth = this.cableCtx.createGain();
    ringDepth.gain.value = 0.0;
    ringOsc.connect(ringDepth);
    ringDepth.connect(ringMod.gain);
    ringOsc.start();
    const ringSum = this.cableCtx.createGain();
    ringSum.gain.value = 1.0;

    const echoDelay = this.cableCtx.createDelay(1.0);
    const echoFb = this.cableCtx.createGain();
    echoFb.gain.value = 0.0;
    const echoGain = this.cableCtx.createGain();
    echoGain.gain.value = 0.0;

    const convolver = this.cableCtx.createConvolver();
    convolver.buffer = this.getOrCreateReverbImpulse(this.cableCtx);
    const reverbGain = this.cableCtx.createGain();
    reverbGain.gain.value = 0.0;

    tempSource.connect(dryGain);
    dryGain.connect(recAnalyser);

    if (pitchNode) {
      hp.connect(pitchNode);
      pitchNode.connect(lp);
    } else {
      hp.connect(lp);
    }
    lp.connect(bass);
    bass.connect(presence);
    presence.connect(shaper);
    shaper.connect(ringBypass);
    shaper.connect(ringMod);
    ringBypass.connect(ringSum);
    ringMod.connect(ringSum);
    ringSum.connect(wetGain);

    ringSum.connect(echoDelay);
    echoDelay.connect(echoFb);
    echoFb.connect(echoDelay);
    echoDelay.connect(echoGain);
    echoGain.connect(wetGain);

    ringSum.connect(convolver);
    convolver.connect(reverbGain);
    reverbGain.connect(wetGain);

    let recWetConnected = false;
    const setRecWetConnected = (connected: boolean) => {
      if (connected && !recWetConnected) {
        try {
          tempSource.connect(hp);
          wetGain.connect(recAnalyser);
          recWetConnected = true;
        } catch { }
      } else if (!connected && recWetConnected) {
        try {
          tempSource.disconnect(hp);
        } catch { }
        try {
          wetGain.disconnect(recAnalyser);
        } catch { }
        recWetConnected = false;
      }
    };

    const applyRecParams = (nextCfg: VoiceChangerConfig, immediate: boolean = false) => {
      if (!this.cableCtx) return;
      const now = this.cableCtx.currentTime;
      const active = Boolean(nextCfg.enabled) && nextCfg.wetMix > 0;
      const wasConnected = recWetConnected;

      if (!active) {
        setRecWetConnected(false);
        this.setParamImmediateOrRamp(dryGain.gain, 1.0, now, true);
        this.setParamImmediateOrRamp(wetGain.gain, 0.0, now, true);
        this.setParamImmediateOrRamp(echoFb.gain, 0.0, now, true);
        this.setParamImmediateOrRamp(echoGain.gain, 0.0, now, true);
        this.setParamImmediateOrRamp(reverbGain.gain, 0.0, now, true);
        this.setParamImmediateOrRamp(ringDepth.gain, 0.0, now, true);
        this.setParamImmediateOrRamp(ringBypass.gain, 1.0, now, true);
        if (pitchNode) {
          const p = pitchNode.parameters.get('semitones');
          if (p) this.setParamImmediateOrRamp(p, 0.0, now, true);
        }
        return;
      }

      const snap = immediate || !wasConnected;
      const rawWet = Math.max(0, Math.min(1, nextCfg.wetMix));
      const wet = rawWet >= 0.99 ? 1 : rawWet;
      const dry = 1 - wet;

      this.setParamImmediateOrRamp(dryGain.gain, dry, now, snap);
      this.setParamImmediateOrRamp(wetGain.gain, wet, now, snap);
      this.setParamImmediateOrRamp(hp.frequency, Math.max(20, Math.min(1500, nextCfg.highpassHz)), now, snap);
      this.setParamImmediateOrRamp(lp.frequency, Math.max(600, Math.min(20000, nextCfg.lowpassHz)), now, snap);
      this.setParamImmediateOrRamp(bass.gain, Math.max(-14, Math.min(16, nextCfg.bassBoostDb)), now, snap);
      this.setParamImmediateOrRamp(presence.gain, Math.max(-10, Math.min(14, nextCfg.clarityBoostDb)), now, snap);

      if (pitchNode) {
        const p = pitchNode.parameters.get('semitones');
        if (p) {
          this.setParamImmediateOrRamp(p, Math.max(-12, Math.min(12, nextCfg.pitchSemitones ?? 0)), now, snap, 0.02);
        }
      }

      const dist = Math.max(0, Math.min(100, nextCfg.distortionAmount));
      shaper.oversample = dist > 0.5 ? '2x' : 'none';
      if (Math.abs(dist - lastRecDist) >= 0.5) {
        shaper.curve = this.createDistortionCurve(dist);
        lastRecDist = dist;
      }

      const ringActive = nextCfg.ringModHz > 0 && nextCfg.ringModMix > 0;
      const ringMix = ringActive ? Math.max(0, Math.min(1, nextCfg.ringModMix)) : 0;
      this.setParamImmediateOrRamp(ringBypass.gain, 1 - ringMix, now, snap);
      this.setParamImmediateOrRamp(ringDepth.gain, ringMix, now, snap);
      this.setParamImmediateOrRamp(ringOsc.frequency, Math.max(10, Math.min(240, nextCfg.ringModHz || 45)), now, snap);

      const echoActive = nextCfg.echoDelayMs > 0 && nextCfg.echoMix > 0;
      this.setParamImmediateOrRamp(echoDelay.delayTime, Math.max(0.01, Math.min(0.6, (nextCfg.echoDelayMs || 100) / 1000)), now, snap, 0.02);
      this.setParamImmediateOrRamp(echoFb.gain, echoActive ? Math.max(0, Math.min(0.75, nextCfg.echoFeedback)) : 0, now, snap, 0.02);
      this.setParamImmediateOrRamp(echoGain.gain, echoActive ? Math.max(0, Math.min(0.9, nextCfg.echoMix)) : 0, now, snap, 0.02);
      this.setParamImmediateOrRamp(reverbGain.gain, Math.max(0, Math.min(0.95, nextCfg.reverbMix)), now, snap, 0.02);

      setRecWetConnected(true);
    };

    applyRecParams(this.voiceChangerConfig, true);
    this.activeRecDspUpdater = (nextCfg) => applyRecParams(nextCfg, false);

    const trackLabel = tempStream.getAudioTracks()?.[0]?.label || 'Mikrofon';
    return {
      stream: recDest.stream,
      analyser: recAnalyser,
      micLabel: trackLabel,
      cleanup: () => {
        this.activeRecDspUpdater = null;
        setRecWetConnected(false);
        try {
          ringOsc.stop();
        } catch { }
        const nodes: Array<AudioNode | null> = [
          tempSource, dryGain, wetGain, hp, pitchNode, lp, bass, presence,
          shaper, ringBypass, ringMod, ringOsc, ringDepth, ringSum,
          echoDelay, echoFb, echoGain, convolver, reverbGain, recAnalyser,
        ];
        for (const n of nodes) {
          try {
            n?.disconnect();
          } catch { }
        }
        tempStream.getTracks().forEach((t) => t.stop());
      },
    };
  }

  // Get active microphone hardware status
  public getMicStatusInfo(): {
    active: boolean;
    label: string;
    level: number;
    muted: boolean;
  } {
    const track = this.micStream?.getAudioTracks()?.[0];
    const isLive = !!(this.micStream && this.micStream.active && track && track.readyState === 'live');
    return {
      active: isLive,
      label: track?.label || '',
      level: this.getMicLevel(),
      muted: !!track?.muted
    };
  }

  // Live microphone level calculation (Measures live microphone voice signal)
  public getMicLevel(): number {
    if (!this.micAnalyser || !this.micStream || !this.micStream.active || !this.isMicEnabled) {
      return 0;
    }

    if (this.cableCtx && this.cableCtx.state === 'suspended') {
      this.cableCtx.resume().catch(() => { });
    }

    // Time-domain RMS signal
    const timeData = new Uint8Array(this.micAnalyser.fftSize);
    this.micAnalyser.getByteTimeDomainData(timeData);

    let sumSq = 0;
    let peak = 0;
    for (let i = 0; i < timeData.length; i++) {
      const val = Math.abs((timeData[i] - 128) / 128);
      if (val > peak) peak = val;
      sumSq += val * val;
    }
    const rms = Math.sqrt(sumSq / timeData.length);

    // Frequency-domain energy
    const freqData = new Uint8Array(this.micAnalyser.frequencyBinCount);
    this.micAnalyser.getByteFrequencyData(freqData);
    let freqMax = 0;
    for (let i = 0; i < freqData.length; i++) {
      if (freqData[i] > freqMax) freqMax = freqData[i];
    }

    // Natural voice responsiveness
    const speechSignal = Math.max(peak * 1.5, rms * 3.5, (freqMax / 255) * 1.4);
    return Math.min(100, Math.round(speechSignal * 100));
  }

  public setPlaybackListener(callback: (playingIds: string[]) => void) {
    this.onPlaybackStateChange = callback;
  }

  public setPlaybackDetailListener(callback: (tracks: PlaybackTrackInfo[]) => void) {
    this.onPlaybackDetailChange = callback;
  }

  public getPlaybackTracks(): PlaybackTrackInfo[] {
    return Array.from(this.playbackMeta.values());
  }

  private emitPlaybackListeners() {
    if (this.onPlaybackStateChange) {
      this.onPlaybackStateChange(Array.from(this.currentlyPlaying));
    }
    if (this.onPlaybackDetailChange) {
      this.onPlaybackDetailChange(Array.from(this.playbackMeta.values()));
    }
  }

  public updateSoundLoop(soundId: string, loop: boolean) {
    if (this.multiSegmentActive.has(soundId)) {
      this.multiSegmentLoopFlags.set(soundId, loop);
    } else {
      const sources = this.activeSources.get(soundId);
      const bounds = this.activeTrimBounds.get(soundId);
      if (sources) {
        sources.forEach((src) => {
          if (bounds) {
            src.loopStart = bounds.start;
            src.loopEnd = bounds.end;
          }
          src.loop = loop;
        });
      }
    }
    const meta = this.playbackMeta.get(soundId);
    if (meta) {
      this.playbackMeta.set(soundId, { ...meta, loop });
      this.emitPlaybackListeners();
    }
  }

  public updateSoundVolume(soundId: string, volume: number) {
    const clamped = Math.max(0, Math.min(1, volume));
    const gains = this.activeSoundGains.get(soundId);
    if (gains) {
      gains.forEach((g) => {
        try {
          g.gain.setValueAtTime(clamped, g.context.currentTime);
        } catch {
          g.gain.value = clamped;
        }
      });
    }
  }

  public setMasterVolume(volume: number) {
    this.masterVolume = Math.max(0, Math.min(1, volume));
    this.initContexts();

    if (this.cableEffectsGain && this.cableCtx) {
      const sfxVol = Math.min(1.5, this.masterVolume * this.SFX_BOOST);
      this.cableEffectsGain.gain.setValueAtTime(sfxVol, this.cableCtx.currentTime);
    }
    if (this.monitorEffectsGain && this.monitorCtx) {
      const monitorVol = this.dualOutputEnabled ? this.masterVolume : 0;
      this.monitorEffectsGain.gain.setValueAtTime(monitorVol, this.monitorCtx.currentTime);
    }
  }

  public getAnalyserData(): Uint8Array {
    if (!this.sfxAnalyser) return new Uint8Array(32);
    const dataArray = new Uint8Array(this.sfxAnalyser.frequencyBinCount);
    this.sfxAnalyser.getByteFrequencyData(dataArray);
    return dataArray;
  }

  public async decodeDataUrlToBuffer(dataUrl: string): Promise<AudioBuffer | null> {
    this.initContexts();
    if (!this.cableCtx || !dataUrl) return null;

    const cached = this.dataUrlBuffers.get(dataUrl);
    if (cached) return cached;

    try {
      let resolvedTarget = dataUrl;
      if (isAssetUri(dataUrl)) {
        const loaded = await loadAudioAssetDataUrl(dataUrl);
        if (!loaded) {
          throw new Error(`Ses varlığı bulunamadı: ${dataUrl}`);
        }
        resolvedTarget = loaded;
      }
      const fetchTarget = resolvedTarget.startsWith('/api/')
        ? getApiUrl(resolvedTarget)
        : resolvedTarget;
      const response = await fetch(fetchTarget);
      if (!response.ok) {
        throw new Error(`Audio fetch HTTP ${response.status}`);
      }
      const arrayBuffer = await response.arrayBuffer();
      const decoded = await this.cableCtx.decodeAudioData(arrayBuffer);
      this.dataUrlBuffers.set(dataUrl, decoded);
      return decoded;
    } catch (err) {
      console.warn('Failed to decode audio data:', err);
      return null;
    }
  }

  public async resolveBufferForRef(
    ref: {
      id?: string;
      dataUrl?: string;
      synthPreset?: string;
      sourceSoundId?: string;
    },
    fallbackTitle?: string,
  ): Promise<AudioBuffer | null> {
    this.initContexts();
    if (!this.cableCtx) return null;

    if (ref.id && this.audioBuffers.has(ref.id)) {
      return this.audioBuffers.get(ref.id)!;
    }

    if (ref.dataUrl) {
      const decoded = await this.decodeDataUrlToBuffer(ref.dataUrl);
      if (decoded) {
        if (ref.id) this.audioBuffers.set(ref.id, decoded);
        return decoded;
      }
    }

    if (ref.sourceSoundId && this.audioBuffers.has(ref.sourceSoundId)) {
      const shared = this.audioBuffers.get(ref.sourceSoundId)!;
      if (ref.id) this.audioBuffers.set(ref.id, shared);
      return shared;
    }

    const presetKey = ref.synthPreset || fallbackTitle;
    if (presetKey) {
      const buffer = this.createProceduralBuffer(presetKey);
      if (buffer) {
        if (ref.id) this.audioBuffers.set(ref.id, buffer);
        return buffer;
      }
    }

    return null;
  }

  public async getOrGenerateBuffer(sound: SoundItem): Promise<AudioBuffer | null> {
    return this.resolveBufferForRef(
      {
        id: sound.id,
        dataUrl: sound.dataUrl,
        synthPreset: sound.synthPreset,
        sourceSoundId: sound.sourceSoundId,
      },
      sound.title,
    );
  }

  public playPreviewBuffer(
    buffer: AudioBuffer,
    startSec: number,
    endSec: number,
    loop: boolean,
    volume: number = 0.85,
    onEnded?: () => void,
  ) {
    this.playPreviewSegments(
      [{ segmentId: '__single__', buffer, startSec, endSec }],
      loop,
      volume,
      onEnded,
    );
  }

  private schedulePreviewCycle(
    sessionId: number,
    ctx: AudioContext,
    gain: GainNode,
    segments: Array<{
      segmentId: string;
      buffer: AudioBuffer;
      startSec: number;
      endSec: number;
    }>,
    onEnded?: () => void,
  ) {
    if (this.previewSessionId !== sessionId) return;

    // Clear previous cycle node refs
    this.previewSources.forEach((s) => {
      try {
        s.onended = null;
        s.stop();
        s.disconnect();
      } catch { }
    });
    this.previewSources = [];

    const sanitized: Array<{
      segmentId: string;
      buffer: AudioBuffer;
      startSec: number;
      endSec: number;
      timelineStart: number;
      timelineEnd: number;
    }> = [];

    let cursor = 0;
    for (const seg of segments) {
      const fullDur = Math.max(0.05, seg.buffer.duration);
      const safeStart = Math.max(0, Math.min(fullDur - 0.02, seg.startSec));
      const safeEnd = Math.max(safeStart + 0.02, Math.min(fullDur, seg.endSec));
      const clipDur = Math.max(0.02, safeEnd - safeStart);
      sanitized.push({
        segmentId: seg.segmentId,
        buffer: seg.buffer,
        startSec: safeStart,
        endSec: safeEnd,
        timelineStart: cursor,
        timelineEnd: cursor + clipDur,
      });
      cursor += clipDur;
    }

    if (sanitized.length === 0) {
      this.stopPreviewBuffer();
      onEnded?.();
      return;
    }

    const baseCtxTime = ctx.currentTime + 0.015;
    this.previewMeta = {
      segments: sanitized,
      totalDuration: cursor,
      startedAtCtxTime: baseCtxTime,
      onEnded,
    };

    if (sanitized.length === 1) {
      const only = sanitized[0];
      const source = ctx.createBufferSource();
      source.buffer = only.buffer;
      source.loop = this.previewLoop;
      if (this.previewLoop) {
        source.loopStart = only.startSec;
        source.loopEnd = only.endSec;
      }
      source.connect(gain);
      this.previewSources = [source];

      source.onended = () => {
        if (this.previewSessionId === sessionId) {
          this.stopPreviewBuffer();
          onEnded?.();
        }
      };

      try {
        if (this.previewLoop) {
          source.start(baseCtxTime, only.startSec);
        } else {
          source.start(baseCtxTime, only.startSec, only.timelineEnd - only.timelineStart);
        }
      } catch (err) {
        console.warn('Preview playback error:', err);
        this.stopPreviewBuffer();
        onEnded?.();
      }
      return;
    }

    const createdSources: AudioBufferSourceNode[] = [];
    for (let i = 0; i < sanitized.length; i++) {
      const item = sanitized[i];
      const source = ctx.createBufferSource();
      source.buffer = item.buffer;
      source.connect(gain);
      createdSources.push(source);

      if (i === sanitized.length - 1) {
        source.onended = () => {
          if (this.previewSessionId !== sessionId) return;
          if (this.previewLoop) {
            this.schedulePreviewCycle(sessionId, ctx, gain, segments, onEnded);
          } else {
            this.stopPreviewBuffer();
            onEnded?.();
          }
        };
      }

      try {
        source.start(
          baseCtxTime + item.timelineStart,
          item.startSec,
          item.timelineEnd - item.timelineStart,
        );
      } catch (err) {
        console.warn('Multi-segment preview playback error:', err);
        this.stopPreviewBuffer();
        onEnded?.();
        return;
      }
    }

    this.previewSources = createdSources;
  }

  public playPreviewSegments(
    segments: Array<{
      segmentId: string;
      buffer: AudioBuffer;
      startSec: number;
      endSec: number;
    }>,
    loop: boolean,
    volume: number = 0.85,
    onEnded?: () => void,
  ) {
    this.initContexts();
    this.resumeContexts();
    this.stopPreviewBuffer();

    const ctx = this.monitorCtx || this.cableCtx;
    const destNode =
      this.monitorLimiter ||
      this.monitorCtx?.destination ||
      this.cableLimiter ||
      this.cableCtx?.destination;
    if (!ctx || !destNode || segments.length === 0) return;

    const sessionId = ++this.previewSessionId;
    this.previewLoop = loop;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(Math.max(0, Math.min(1, volume)), ctx.currentTime);
    gain.connect(destNode);
    this.previewGain = gain;

    this.schedulePreviewCycle(sessionId, ctx, gain, segments, onEnded);
  }

  public stopPreviewBuffer() {
    this.previewSessionId++;
    if (this.previewSources.length > 0) {
      this.previewSources.forEach((src) => {
        try {
          src.onended = null;
          src.stop();
          src.disconnect();
        } catch {
          // ignore
        }
      });
      this.previewSources = [];
    }
    if (this.previewGain) {
      try {
        this.previewGain.disconnect();
      } catch {
        // ignore
      }
      this.previewGain = null;
    }
    this.previewMeta = null;
  }

  public updatePreviewLoop(loop: boolean, startSec: number, endSec: number) {
    this.previewLoop = loop;
    if (this.previewSources.length === 1 && this.previewMeta && this.previewMeta.segments.length === 1) {
      const src = this.previewSources[0];
      src.loopStart = startSec;
      src.loopEnd = endSec;
      src.loop = loop;
      const only = this.previewMeta.segments[0];
      const dur = Math.max(0.02, endSec - startSec);
      this.previewMeta = {
        ...this.previewMeta,
        segments: [{ ...only, startSec, endSec, timelineStart: 0, timelineEnd: dur }],
        totalDuration: dur,
      };
    }
  }

  public updatePreviewVolume(volume: number) {
    if (!this.previewGain) return;
    const clamped = Math.max(0, Math.min(1, volume));
    try {
      this.previewGain.gain.setValueAtTime(clamped, this.previewGain.context.currentTime);
    } catch {
      this.previewGain.gain.value = clamped;
    }
  }

  public getPreviewStatus(): { timeInBuffer: number; segmentId: string | null } | null {
    if (this.previewSources.length === 0 || !this.previewMeta) return null;
    const ctx = this.monitorCtx || this.cableCtx;
    if (!ctx) return null;

    const { segments, totalDuration, startedAtCtxTime } = this.previewMeta;
    if (segments.length === 0 || totalDuration <= 0) return null;

    const rawElapsed = Math.max(0, ctx.currentTime - startedAtCtxTime);
    const cycleElapsed =
      this.previewLoop && segments.length === 1
        ? rawElapsed % totalDuration
        : this.previewLoop
          ? rawElapsed % totalDuration
          : Math.min(totalDuration, rawElapsed);

    for (const seg of segments) {
      if (cycleElapsed <= seg.timelineEnd || seg === segments[segments.length - 1]) {
        const localOffset = Math.max(0, cycleElapsed - seg.timelineStart);
        return {
          segmentId: seg.segmentId,
          timeInBuffer: Math.min(seg.endSec, seg.startSec + localOffset),
        };
      }
    }
    return null;
  }

  public getPreviewPlaybackTime(): number | null {
    return this.getPreviewStatus()?.timeInBuffer ?? null;
  }

  private cleanupSoundNodesOnly(soundId: string) {
    const prevSources = this.activeSources.get(soundId);
    if (prevSources) {
      prevSources.forEach((source) => {
        try {
          this.allLiveSources.delete(source);
          source.onended = null;
          source.stop();
          source.disconnect();
        } catch { }
      });
    }
    const prevGains = this.activeSoundGains.get(soundId);
    if (prevGains) {
      prevGains.forEach((g) => {
        try {
          g.disconnect();
        } catch { }
      });
    }
  }

  private scheduleMultiSegmentSoundCycle(
    sound: SoundItem,
    instanceId: number,
    segments: Array<{ buffer: AudioBuffer; start: number; end: number; duration: number }>,
    soundVolume: number,
    shouldUseMonitor: boolean,
  ) {
    if (!this.cableCtx || !this.cableEffectsGain) return;
    if (this.currentPlayInstance.get(sound.id) !== instanceId) return;

    this.cleanupSoundNodesOnly(sound.id);

    const sourcesToTrack: AudioBufferSourceNode[] = [];
    const gainsToTrack: GainNode[] = [];

    const cableSoundGain = this.cableCtx.createGain();
    cableSoundGain.gain.setValueAtTime(soundVolume, this.cableCtx.currentTime);
    cableSoundGain.connect(this.cableEffectsGain);
    gainsToTrack.push(cableSoundGain);

    let monitorSoundGain: GainNode | null = null;
    if (shouldUseMonitor && this.monitorCtx && this.monitorEffectsGain) {
      monitorSoundGain = this.monitorCtx.createGain();
      monitorSoundGain.gain.setValueAtTime(soundVolume, this.monitorCtx.currentTime);
      monitorSoundGain.connect(this.monitorEffectsGain);
      gainsToTrack.push(monitorSoundGain);
    }

    const cableBaseTime = this.cableCtx.currentTime + 0.015;
    const monitorBaseTime = this.monitorCtx ? this.monitorCtx.currentTime + 0.015 : 0;

    let offset = 0;
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      const cableSource = this.cableCtx.createBufferSource();
      cableSource.buffer = seg.buffer;
      cableSource.connect(cableSoundGain);
      sourcesToTrack.push(cableSource);
      this.allLiveSources.add(cableSource);

      if (i === segments.length - 1) {
        cableSource.onended = () => {
          this.allLiveSources.delete(cableSource);
          if (this.currentPlayInstance.get(sound.id) !== instanceId) {
            this.checkAndApplyMicDucking();
            return;
          }
          if (this.multiSegmentLoopFlags.get(sound.id)) {
            this.scheduleMultiSegmentSoundCycle(
              sound,
              instanceId,
              segments,
              soundVolume,
              shouldUseMonitor,
            );
            return;
          }
          this.activeSources.delete(sound.id);
          this.activeSoundGains.delete(sound.id);
          this.activeTrimBounds.delete(sound.id);
          this.multiSegmentActive.delete(sound.id);
          this.multiSegmentLoopFlags.delete(sound.id);
          this.currentlyPlaying.delete(sound.id);
          this.playbackMeta.delete(sound.id);
          this.currentPlayInstance.delete(sound.id);
          this.emitPlaybackListeners();
          this.checkAndApplyMicDucking();
        };
      } else {
        cableSource.onended = () => {
          this.allLiveSources.delete(cableSource);
        };
      }

      let monSource: AudioBufferSourceNode | null = null;
      if (monitorSoundGain && this.monitorCtx) {
        monSource = this.monitorCtx.createBufferSource();
        monSource.buffer = seg.buffer;
        monSource.connect(monitorSoundGain);
        sourcesToTrack.push(monSource);
        this.allLiveSources.add(monSource);
        monSource.onended = () => {
          if (monSource) this.allLiveSources.delete(monSource);
          this.checkAndApplyMicDucking();
        };
      }

      try {
        cableSource.start(cableBaseTime + offset, seg.start, seg.duration);
        if (monSource) {
          monSource.start(monitorBaseTime + offset, seg.start, seg.duration);
        }
      } catch (e) {
        console.warn('Multi-segment playback start error:', e);
        this.stopSound(sound.id);
        return;
      }

      offset += seg.duration;
    }

    this.activeSources.set(sound.id, sourcesToTrack);
    this.activeSoundGains.set(sound.id, gainsToTrack);
    this.checkAndApplyMicDucking();
  }

  public async playSound(
    sound: SoundItem,
    masterVolume: number,
    isCutoffMode: boolean,
    primaryDeviceId?: string,
    secondaryDeviceId?: string,
    dualOutput?: boolean
  ) {
    this.initContexts();
    this.resumeContexts();

    if (!this.cableCtx || !this.cableEffectsGain) return;

    if (primaryDeviceId !== undefined || secondaryDeviceId !== undefined || dualOutput !== undefined) {
      this.setRoutingConfig(
        primaryDeviceId || this.primaryDeviceId,
        secondaryDeviceId || this.secondaryDeviceId,
        dualOutput !== undefined ? dualOutput : this.dualOutputEnabled,
        masterVolume
      );
    }

    if (isCutoffMode) {
      this.stopAll();
    } else {
      // Immediately stop any existing playback of this exact sound to prevent stacking
      this.stopSound(sound.id);
    }

    // Assign a monotonic token to this play request
    const requestToken = ++this.tokenCounter;
    this.pendingTokens.set(sound.id, requestToken);

    const isSameTargetDevice =
      this.resolvedSameOutputDevice ||
      this.primaryDeviceId === this.secondaryDeviceId ||
      ((!this.primaryDeviceId || this.primaryDeviceId === 'default') &&
        (!this.secondaryDeviceId || this.secondaryDeviceId === 'default'));

    const shouldUseMonitor =
      this.dualOutputEnabled &&
      !isSameTargetDevice &&
      !this.isSecondaryVirtualCable &&
      Boolean(this.monitorCtx && this.monitorEffectsGain);

    // Multi-segment non-destructive playback branch
    if (sound.segments && sound.segments.length > 0) {
      const parentFallback =
        sound.dataUrl || sound.synthPreset || sound.sourceSoundId
          ? await this.getOrGenerateBuffer(sound)
          : null;

      if (this.pendingTokens.get(sound.id) !== requestToken) return;

      const resolvedSegments: Array<{
        buffer: AudioBuffer;
        start: number;
        end: number;
        duration: number;
      }> = [];

      for (const seg of sound.segments) {
        const segBuffer =
          (await this.resolveBufferForRef(
            {
              dataUrl: seg.dataUrl,
              synthPreset: seg.synthPreset,
              sourceSoundId: seg.sourceSoundId,
            },
            seg.label,
          )) || parentFallback;

        if (this.pendingTokens.get(sound.id) !== requestToken) return;
        if (!segBuffer) continue;

        const fullDur = Math.max(0.05, segBuffer.duration);
        const sStart = Math.max(0, Math.min(fullDur - 0.02, seg.start));
        const sEnd = Math.max(sStart + 0.02, Math.min(fullDur, seg.end));
        resolvedSegments.push({
          buffer: segBuffer,
          start: sStart,
          end: sEnd,
          duration: Math.max(0.02, sEnd - sStart),
        });
      }

      if (resolvedSegments.length === 0) {
        this.pendingTokens.delete(sound.id);
        return;
      }

      if (resolvedSegments.length > 1) {
        const totalDur = resolvedSegments.reduce((sum, s) => sum + s.duration, 0);
        const instanceId = requestToken;
        this.currentPlayInstance.set(sound.id, instanceId);
        this.multiSegmentActive.add(sound.id);
        this.multiSegmentLoopFlags.set(sound.id, !!sound.loop);
        this.currentlyPlaying.add(sound.id);
        this.playbackMeta.set(sound.id, {
          soundId: sound.id,
          startedAt: Date.now(),
          duration: totalDur || sound.duration || 1,
          loop: !!sound.loop,
        });
        this.emitPlaybackListeners();

        this.scheduleMultiSegmentSoundCycle(
          sound,
          instanceId,
          resolvedSegments,
          sound.volume ?? 1,
          shouldUseMonitor,
        );
        return;
      }

      // Single segment behaves identically to single trim
      const only = resolvedSegments[0];
      sound = {
        ...sound,
        trimStart: only.start,
        trimEnd: only.end,
        dataUrl: sound.segments[0].dataUrl ?? sound.dataUrl,
        synthPreset: sound.segments[0].synthPreset ?? sound.synthPreset,
        sourceSoundId: sound.segments[0].sourceSoundId ?? sound.sourceSoundId,
      };
    }

    const buffer = await this.getOrGenerateBuffer(sound);

    // If request was cancelled or superseded while resolving buffer, drop it completely!
    if (this.pendingTokens.get(sound.id) !== requestToken) {
      return;
    }

    if (!buffer || !this.cableCtx || !this.cableEffectsGain) {
      this.pendingTokens.delete(sound.id);
      return;
    }

    const soundVolume = sound.volume ?? 1;
    const sourcesToTrack: AudioBufferSourceNode[] = [];
    const gainsToTrack: GainNode[] = [];
    const instanceId = requestToken;

    const fullDuration = Math.max(0.05, buffer.duration);
    const trimStart = Math.max(0, Math.min(fullDuration - 0.02, sound.trimStart ?? 0));
    const rawTrimEnd = sound.trimEnd !== undefined ? sound.trimEnd : fullDuration;
    const trimEnd = Math.max(trimStart + 0.02, Math.min(fullDuration, rawTrimEnd));
    const clipDuration = Math.max(0.02, trimEnd - trimStart);
    const isTrimmed = trimStart > 0.001 || trimEnd < fullDuration - 0.001;

    // 1. Play on Cable Context (Discord / Stream mixer)
    const cableSource = this.cableCtx.createBufferSource();
    cableSource.buffer = buffer;
    cableSource.loop = !!sound.loop;
    if (isTrimmed) {
      cableSource.loopStart = trimStart;
      cableSource.loopEnd = trimEnd;
    }

    const cableSoundGain = this.cableCtx.createGain();
    cableSoundGain.gain.setValueAtTime(soundVolume, this.cableCtx.currentTime);

    cableSource.connect(cableSoundGain);
    cableSoundGain.connect(this.cableEffectsGain);

    sourcesToTrack.push(cableSource);
    gainsToTrack.push(cableSoundGain);
    this.allLiveSources.add(cableSource);

    // 2. Play on Monitor Context if dual output is enabled (User's Headphones)
    let monitorSource: AudioBufferSourceNode | null = null;
    if (shouldUseMonitor && this.monitorCtx && this.monitorEffectsGain) {
      monitorSource = this.monitorCtx.createBufferSource();
      monitorSource.buffer = buffer;
      monitorSource.loop = !!sound.loop;
      if (isTrimmed) {
        monitorSource.loopStart = trimStart;
        monitorSource.loopEnd = trimEnd;
      }

      const monitorSoundGain = this.monitorCtx.createGain();
      monitorSoundGain.gain.setValueAtTime(soundVolume, this.monitorCtx.currentTime);

      monitorSource.connect(monitorSoundGain);
      monitorSoundGain.connect(this.monitorEffectsGain);

      sourcesToTrack.push(monitorSource);
      gainsToTrack.push(monitorSoundGain);
      this.allLiveSources.add(monitorSource);

      monitorSource.onended = () => {
        if (monitorSource) {
          this.allLiveSources.delete(monitorSource);
          this.checkAndApplyMicDucking();
        }
      };
    }

    cableSource.onended = () => {
      this.allLiveSources.delete(cableSource);
      // Only remove playing state if this exact instance is the active one!
      if (this.currentPlayInstance.get(sound.id) === instanceId) {
        this.activeSources.delete(sound.id);
        this.activeSoundGains.delete(sound.id);
        this.activeTrimBounds.delete(sound.id);
        this.multiSegmentActive.delete(sound.id);
        this.multiSegmentLoopFlags.delete(sound.id);
        this.currentlyPlaying.delete(sound.id);
        this.playbackMeta.delete(sound.id);
        this.currentPlayInstance.delete(sound.id);
        this.emitPlaybackListeners();
      }
      this.checkAndApplyMicDucking();
    };

    this.activeSources.set(sound.id, sourcesToTrack);
    this.activeSoundGains.set(sound.id, gainsToTrack);
    this.activeTrimBounds.set(sound.id, { start: trimStart, end: trimEnd });
    this.currentPlayInstance.set(sound.id, instanceId);
    this.currentlyPlaying.add(sound.id);
    this.playbackMeta.set(sound.id, {
      soundId: sound.id,
      startedAt: Date.now(),
      duration: clipDuration || sound.duration || 1,
      loop: !!sound.loop,
    });

    // Apply mic ducking immediately when playback starts to eradicate acoustic echo
    this.checkAndApplyMicDucking();
    this.emitPlaybackListeners();

    try {
      if (sound.loop) {
        cableSource.start(0, trimStart);
        if (monitorSource) {
          monitorSource.start(0, trimStart);
        }
      } else if (isTrimmed) {
        cableSource.start(0, trimStart, clipDuration);
        if (monitorSource) {
          monitorSource.start(0, trimStart, clipDuration);
        }
      } else {
        cableSource.start(0);
        if (monitorSource) {
          monitorSource.start(0);
        }
      }
    } catch (e) {
      console.warn('Audio playback start error:', e);
      this.stopSound(sound.id);
    }
  }

  public stopSound(soundId: string) {
    this.pendingTokens.delete(soundId);
    this.currentPlayInstance.delete(soundId);
    this.multiSegmentActive.delete(soundId);
    this.multiSegmentLoopFlags.delete(soundId);

    this.cleanupSoundNodesOnly(soundId);
    this.activeSources.delete(soundId);
    this.activeSoundGains.delete(soundId);
    this.activeTrimBounds.delete(soundId);
    this.currentlyPlaying.delete(soundId);
    this.playbackMeta.delete(soundId);
    this.checkAndApplyMicDucking();
    this.emitPlaybackListeners();
  }

  public stopAll() {
    this.pendingTokens.clear();
    this.currentPlayInstance.clear();
    this.multiSegmentActive.clear();
    this.multiSegmentLoopFlags.clear();

    this.activeSources.forEach((sources) => {
      sources.forEach((source) => {
        try {
          source.onended = null;
          source.stop();
          source.disconnect();
        } catch (e) { }
      });
    });
    this.activeSources.clear();
    this.activeSoundGains.clear();
    this.activeTrimBounds.clear();

    // Universal failsafe: Terminate and disconnect all live sources
    this.allLiveSources.forEach((source) => {
      try {
        source.onended = null;
        source.stop();
        source.disconnect();
      } catch (e) { }
    });
    this.allLiveSources.clear();

    this.currentlyPlaying.clear();
    this.playbackMeta.clear();
    this.checkAndApplyMicDucking();
    this.emitPlaybackListeners();
  }

  public isPlaying(soundId: string): boolean {
    return this.currentlyPlaying.has(soundId);
  }

  // Synthesizers
  private createProceduralBuffer(preset: string): AudioBuffer | null {
    if (!this.cableCtx) return null;
    const sampleRate = this.cableCtx.sampleRate;

    switch (preset.toLowerCase()) {
      case 'airhorn': {
        const duration = 1.35;
        const length = sampleRate * duration;
        const buffer = this.cableCtx.createBuffer(2, length, sampleRate);
        const left = buffer.getChannelData(0);
        const right = buffer.getChannelData(1);
        const fundamental = 466.16;
        const sub = 233.08;
        const high = 932.33;

        for (let i = 0; i < length; i++) {
          const t = i / sampleRate;
          let env = 0;
          if (t < 0.22) env = Math.sin((t / 0.22) * Math.PI);
          else if (t >= 0.25 && t < 0.48) env = Math.sin(((t - 0.25) / 0.23) * Math.PI);
          else if (t >= 0.52 && t < 1.3) env = Math.sin(((t - 0.52) / 0.78) * Math.PI * 0.5) * Math.exp(-(t - 0.52) * 1.5);

          const wave =
            Math.sin(2 * Math.PI * fundamental * t) * 0.4 +
            Math.sin(2 * Math.PI * sub * t) * 0.3 +
            Math.sin(2 * Math.PI * high * t) * 0.2 +
            (Math.random() * 2 - 1) * 0.04;

          const val = wave * env * 0.95;
          left[i] = val;
          right[i] = val * 0.95;
        }
        return buffer;
      }

      case 'hitmarker': {
        const duration = 0.12;
        const length = sampleRate * duration;
        const buffer = this.cableCtx.createBuffer(2, length, sampleRate);
        const left = buffer.getChannelData(0);
        const right = buffer.getChannelData(1);

        for (let i = 0; i < length; i++) {
          const t = i / sampleRate;
          const env = Math.exp(-t * 60);
          const noise = Math.random() * 2 - 1;
          const tone = Math.sin(2 * Math.PI * (2400 - t * 4000) * t);
          const val = (noise * 0.4 + tone * 0.6) * env * 0.95;
          left[i] = val;
          right[i] = val;
        }
        return buffer;
      }

      case 'bassdrop':
      case '808boom': {
        const duration = 2.4;
        const length = sampleRate * duration;
        const buffer = this.cableCtx.createBuffer(2, length, sampleRate);
        const left = buffer.getChannelData(0);
        const right = buffer.getChannelData(1);

        for (let i = 0; i < length; i++) {
          const t = i / sampleRate;
          const freq = Math.max(36, 160 * Math.exp(-t * 4));
          const env = Math.exp(-t * 1.2);
          const distortion = Math.tanh(Math.sin(2 * Math.PI * freq * t) * 1.6);
          const val = distortion * env * 0.98;
          left[i] = val;
          right[i] = val;
        }
        return buffer;
      }

      case 'levelup':
      case 'victory': {
        const duration = 1.1;
        const length = sampleRate * duration;
        const buffer = this.cableCtx.createBuffer(2, length, sampleRate);
        const left = buffer.getChannelData(0);
        const right = buffer.getChannelData(1);
        const notes = [523.25, 659.25, 783.99, 1046.5];

        for (let i = 0; i < length; i++) {
          const t = i / sampleRate;
          let noteIdx = Math.floor(t / 0.16);
          if (noteIdx >= notes.length) noteIdx = notes.length - 1;
          const freq = notes[noteIdx];
          const noteTime = t % 0.16;
          const env = Math.exp(-noteTime * 6);
          const phase = (t * freq) % 1;
          const square = phase > 0.5 ? 0.4 : -0.4;
          const val = square * env * 0.85;
          left[i] = val;
          right[i] = val;
        }
        return buffer;
      }

      case 'bruh': {
        const duration = 0.9;
        const length = sampleRate * duration;
        const buffer = this.cableCtx.createBuffer(2, length, sampleRate);
        const left = buffer.getChannelData(0);
        const right = buffer.getChannelData(1);

        for (let i = 0; i < length; i++) {
          const t = i / sampleRate;
          const freq = 120 * Math.exp(-t * 3.5);
          const env = Math.sin(Math.min(Math.PI, (t / 0.8) * Math.PI)) * Math.exp(-t * 1.8);
          const formant = Math.sin(2 * Math.PI * freq * t) + 0.3 * Math.sin(2 * Math.PI * (freq * 2.5) * t);
          const val = Math.tanh(formant * 1.2) * env * 0.95;
          left[i] = val;
          right[i] = val;
        }
        return buffer;
      }

      case 'laser':
      case 'pew': {
        const duration = 0.45;
        const length = sampleRate * duration;
        const buffer = this.cableCtx.createBuffer(2, length, sampleRate);
        const left = buffer.getChannelData(0);
        const right = buffer.getChannelData(1);

        for (let i = 0; i < length; i++) {
          const t = i / sampleRate;
          const freq = 3200 * Math.exp(-t * 12);
          const env = Math.exp(-t * 6);
          const val = Math.sin(2 * Math.PI * freq * t) * env * 0.85;
          left[i] = val;
          right[i] = val;
        }
        return buffer;
      }

      case 'coin': {
        const duration = 0.55;
        const length = sampleRate * duration;
        const buffer = this.cableCtx.createBuffer(2, length, sampleRate);
        const left = buffer.getChannelData(0);
        const right = buffer.getChannelData(1);

        for (let i = 0; i < length; i++) {
          const t = i / sampleRate;
          const freq = t < 0.12 ? 987.77 : 1318.51;
          const noteT = t < 0.12 ? t : t - 0.12;
          const env = Math.exp(-noteT * 7);
          const val = Math.sin(2 * Math.PI * freq * t) * env * 0.85;
          left[i] = val;
          right[i] = val;
        }
        return buffer;
      }

      case 'applause': {
        const duration = 2.0;
        const length = sampleRate * duration;
        const buffer = this.cableCtx.createBuffer(2, length, sampleRate);
        const left = buffer.getChannelData(0);
        const right = buffer.getChannelData(1);

        for (let i = 0; i < length; i++) {
          const t = i / sampleRate;
          const env = Math.sin((t / duration) * Math.PI) * 0.7;
          const clapLeft = (Math.random() * 2 - 1) * env;
          const clapRight = (Math.random() * 2 - 1) * env;
          left[i] = clapLeft * 0.8;
          right[i] = clapRight * 0.8;
        }
        return buffer;
      }

      default: {
        const duration = 0.6;
        const length = sampleRate * duration;
        const buffer = this.cableCtx.createBuffer(2, length, sampleRate);
        const left = buffer.getChannelData(0);
        const right = buffer.getChannelData(1);

        for (let i = 0; i < length; i++) {
          const t = i / sampleRate;
          const freq = 440;
          const env = Math.exp(-t * 5);
          const val = Math.sin(2 * Math.PI * freq * t) * env * 0.85;
          left[i] = val;
          right[i] = val;
        }
        return buffer;
      }
    }
  }
}

export const audioEngine = new AudioEngine();
