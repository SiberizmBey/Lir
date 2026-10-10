import { SoundItem } from '../types/sound';

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
  private cableEffectsGain: GainNode | null = null;
  private micGainNode: GainNode | null = null;
  private micSourceNode: MediaStreamAudioSourceNode | null = null;
  private micAnalyser: AnalyserNode | null = null;
  private micStream: MediaStream | null = null;

  // 2. Secondary Context: Headphones (Local Monitoring)
  // ONLY Soundboard SFX plays here (User's own voice NEVER plays in headphones to prevent annoying echo)
  private monitorCtx: AudioContext | null = null;
  private monitorEffectsGain: GainNode | null = null;

  // Visualizer analyser for Soundboard SFX
  private sfxAnalyser: AnalyserNode | null = null;

  // State
  private currentMicDeviceId: string = '';
  private isMicEnabled: boolean = false;
  private currentMicVolume: number = 1.0;
  private isMicConnecting: boolean = false;

  // Active playing sources
  private activeSources: Map<string, AudioBufferSourceNode[]> = new Map();
  private audioBuffers: Map<string, AudioBuffer> = new Map();
  private onPlaybackStateChange?: (playingIds: string[]) => void;
  private currentlyPlaying: Set<string> = new Set();

  private primaryDeviceId: string = 'default';
  private secondaryDeviceId: string = 'default';
  private dualOutputEnabled: boolean = true;
  private masterVolume: number = 0.85;

  // Boost multipliers for streaming
  private readonly SFX_BOOST = 1.6;
  private readonly MIC_BOOST = 1.5;

  private initContexts() {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;

    // 1. Cable Context (Main Discord mixer)
    if (!this.cableCtx) {
      this.cableCtx = new AudioCtx({ latencyHint: 'interactive' });

      // Master output bus going directly to VB-CABLE Input (Hardware Sink)
      this.cableMasterBus = this.cableCtx.createGain();
      this.cableMasterBus.gain.setValueAtTime(1.0, this.cableCtx.currentTime);
      this.cableMasterBus.connect(this.cableCtx.destination);

      // Effects sub-bus
      this.cableEffectsGain = this.cableCtx.createGain();
      const sfxVol = Math.min(2.5, this.masterVolume * this.SFX_BOOST);
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
      this.monitorEffectsGain.connect(this.monitorCtx.destination);
    }

    this.resumeContexts();
    this.updateSinkIds();
  }

  public resumeContexts() {
    if (this.cableCtx && this.cableCtx.state === 'suspended') {
      this.cableCtx.resume().catch(() => {});
    }
    if (this.monitorCtx && this.monitorCtx.state === 'suspended') {
      this.monitorCtx.resume().catch(() => {});
    }
  }

  public setRoutingConfig(
    primaryId: string,
    secondaryId: string,
    dualOutput: boolean,
    volume: number
  ) {
    this.primaryDeviceId = primaryId || 'default';
    this.secondaryDeviceId = secondaryId || 'default';
    this.dualOutputEnabled = dualOutput;
    this.masterVolume = Math.max(0, Math.min(1, volume));

    this.initContexts();

    if (this.cableEffectsGain && this.cableCtx) {
      const sfxVol = Math.min(2.5, this.masterVolume * this.SFX_BOOST);
      this.cableEffectsGain.gain.setValueAtTime(sfxVol, this.cableCtx.currentTime);
    }

    if (this.monitorEffectsGain && this.monitorCtx) {
      const monitorVol = this.dualOutputEnabled ? this.masterVolume : 0;
      this.monitorEffectsGain.gain.setValueAtTime(monitorVol, this.monitorCtx.currentTime);
    }

    this.updateSinkIds();
  }

  private async updateSinkIds() {
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

    // If already active on the same device, update volume
    if (this.isMicEnabled && this.micStream && this.micStream.active && this.currentMicDeviceId === targetDeviceId) {
      if (this.micGainNode && this.cableCtx) {
        const targetVol = volume * this.MIC_BOOST;
        this.micGainNode.gain.setValueAtTime(targetVol, this.cableCtx.currentTime);
      }
      return { success: true };
    }

    if (this.isMicConnecting) {
      return { success: true };
    }
    this.isMicConnecting = true;

    this.cleanupMicStream();
    this.isMicEnabled = true;
    this.currentMicDeviceId = targetDeviceId;

    try {
      let stream: MediaStream | null = null;

      // 1. Request target microphone with exact matching
      if (targetDeviceId && targetDeviceId !== 'default') {
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            audio: { deviceId: { exact: targetDeviceId } }
          });
        } catch (e1) {
          console.warn('Exact deviceId match failed, trying direct deviceId:', e1);
          try {
            stream = await navigator.mediaDevices.getUserMedia({
              audio: { deviceId: targetDeviceId }
            });
          } catch (e2) {
            console.warn('Direct deviceId failed, trying ideal:', e2);
            try {
              stream = await navigator.mediaDevices.getUserMedia({
                audio: { deviceId: { ideal: targetDeviceId } }
              });
            } catch (e3) {}
          }
        }
      }

      // 2. Fallback to system default audio if deviceId was default or unavailable
      if (!stream) {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      }

      if (!stream) {
        throw new Error('Mikrofon akışı alınamadı. Lütfen Windows mikrofon izinlerini kontrol edin.');
      }

      // Activate all audio tracks
      stream.getAudioTracks().forEach((track) => {
        track.enabled = true;
      });

      this.micStream = stream;
      window.__lir_active_mic_stream = stream;

      if (!this.cableCtx || !this.cableMasterBus) {
        throw new Error('Ses mikseri hazır değil.');
      }

      // Ensure AudioContext is fully running
      if (this.cableCtx.state === 'suspended') {
        await this.cableCtx.resume().catch(() => {});
      }

      // Create Microphone Source Node
      this.micSourceNode = this.cableCtx.createMediaStreamSource(stream);
      window.__lir_active_mic_source = this.micSourceNode;

      // Create Microphone Gain Node
      this.micGainNode = this.cableCtx.createGain();
      const boostedMicVol = volume * this.MIC_BOOST;
      this.micGainNode.gain.setValueAtTime(boostedMicVol, this.cableCtx.currentTime);

      // Connect mic to Gain
      this.micSourceNode.connect(this.micGainNode);

      // Connect mic to VU Meter Analyser (Measures ONLY microphone, never soundboard!)
      if (this.micAnalyser) {
        this.micGainNode.connect(this.micAnalyser);
      }

      // MIX MIC INTO THE CABLE MASTER BUS (Goes straight to Discord via VB-CABLE!)
      this.micGainNode.connect(this.cableMasterBus);

      this.resumeContexts();
      this.isMicConnecting = false;
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
    if (this.micSourceNode) {
      try {
        this.micSourceNode.disconnect();
      } catch (e) {}
      this.micSourceNode = null;
      window.__lir_active_mic_source = null;
    }
    if (this.micGainNode) {
      try {
        this.micGainNode.disconnect();
      } catch (e) {}
      this.micGainNode = null;
    }
    if (this.micStream) {
      try {
        this.micStream.getTracks().forEach((track) => {
          track.stop();
        });
      } catch (e) {}
      this.micStream = null;
      window.__lir_active_mic_stream = null;
    }
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
      this.cableCtx.resume().catch(() => {});
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

  public setMasterVolume(volume: number) {
    this.masterVolume = Math.max(0, Math.min(1, volume));
    this.initContexts();

    if (this.cableEffectsGain && this.cableCtx) {
      const sfxVol = Math.min(2.5, this.masterVolume * this.SFX_BOOST);
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

  public async getOrGenerateBuffer(sound: SoundItem): Promise<AudioBuffer | null> {
    this.initContexts();
    if (!this.cableCtx) return null;

    if (this.audioBuffers.has(sound.id)) {
      return this.audioBuffers.get(sound.id)!;
    }

    if (sound.dataUrl) {
      try {
        const response = await fetch(sound.dataUrl);
        const arrayBuffer = await response.arrayBuffer();
        const decoded = await this.cableCtx.decodeAudioData(arrayBuffer);
        this.audioBuffers.set(sound.id, decoded);
        return decoded;
      } catch (err) {
        console.warn('Failed to decode audio data:', err);
      }
    }

    const buffer = this.createProceduralBuffer(sound.synthPreset || sound.title);
    if (buffer) {
      this.audioBuffers.set(sound.id, buffer);
      return buffer;
    }

    return null;
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
    }

    if (this.activeSources.has(sound.id)) {
      this.stopSound(sound.id);
    }

    const buffer = await this.getOrGenerateBuffer(sound);
    if (!buffer) return;

    const soundVolume = sound.volume ?? 1;
    const sourcesToTrack: AudioBufferSourceNode[] = [];

    // 1. Play on Cable Context (Discord / Stream mixer)
    const cableSource = this.cableCtx.createBufferSource();
    cableSource.buffer = buffer;
    cableSource.loop = !!sound.loop;

    const cableSoundGain = this.cableCtx.createGain();
    cableSoundGain.gain.setValueAtTime(soundVolume, this.cableCtx.currentTime);

    cableSource.connect(cableSoundGain);
    cableSoundGain.connect(this.cableEffectsGain);

    sourcesToTrack.push(cableSource);
    cableSource.start();

    // 2. Play on Monitor Context if dual output is enabled (User's Headphones)
    if (this.dualOutputEnabled && this.monitorCtx && this.monitorEffectsGain) {
      const monitorSource = this.monitorCtx.createBufferSource();
      monitorSource.buffer = buffer;
      monitorSource.loop = !!sound.loop;

      const monitorSoundGain = this.monitorCtx.createGain();
      monitorSoundGain.gain.setValueAtTime(soundVolume, this.monitorCtx.currentTime);

      monitorSource.connect(monitorSoundGain);
      monitorSoundGain.connect(this.monitorEffectsGain);

      sourcesToTrack.push(monitorSource);
      monitorSource.start();
    }

    cableSource.onended = () => {
      this.activeSources.delete(sound.id);
      this.currentlyPlaying.delete(sound.id);
      if (this.onPlaybackStateChange) {
        this.onPlaybackStateChange(Array.from(this.currentlyPlaying));
      }
    };

    this.activeSources.set(sound.id, sourcesToTrack);
    this.currentlyPlaying.add(sound.id);

    if (this.onPlaybackStateChange) {
      this.onPlaybackStateChange(Array.from(this.currentlyPlaying));
    }
  }

  public stopSound(soundId: string) {
    const sources = this.activeSources.get(soundId);
    if (sources) {
      sources.forEach((source) => {
        try {
          source.stop();
          source.disconnect();
        } catch (e) {}
      });
      this.activeSources.delete(soundId);
    }
    this.currentlyPlaying.delete(soundId);
    if (this.onPlaybackStateChange) {
      this.onPlaybackStateChange(Array.from(this.currentlyPlaying));
    }
  }

  public stopAll() {
    this.activeSources.forEach((sources) => {
      sources.forEach((source) => {
        try {
          source.stop();
          source.disconnect();
        } catch (e) {}
      });
    });
    this.activeSources.clear();
    this.currentlyPlaying.clear();
    if (this.onPlaybackStateChange) {
      this.onPlaybackStateChange([]);
    }
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
