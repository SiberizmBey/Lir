const PITCH_WORKLET_PROCESSOR_NAME = "lir-pitch-shifter-processor";

const PITCH_WORKLET_SOURCE = `
class LirPitchShifterProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      {
        name: "semitones",
        defaultValue: 0,
        minValue: -12,
        maxValue: 12,
        automationRate: "k-rate",
      },
    ];
  }

  constructor() {
    super();
    this.bufferSize = 8192;
    this.bufferMask = 8191;
    this.windowSize = Math.max(512, Math.round(sampleRate * 0.042));
    this.rings = [new Float32Array(this.bufferSize), new Float32Array(this.bufferSize)];
    this.writeIndex = 0;
    this.phase = 0;
    this.smoothedSemitones = 0;
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const output = outputs[0];
    if (!output || output.length === 0) return true;
    if (!input || input.length === 0) {
      for (let ch = 0; ch < output.length; ch++) {
        output[ch].fill(0);
      }
      return true;
    }

    const semitonesParam = parameters.semitones;
    const targetSemitones = semitonesParam && semitonesParam.length > 0 ? semitonesParam[0] : 0;

    // Fast zero-latency bypass when pitch shift is inactive
    if (Math.abs(targetSemitones) < 0.05 && Math.abs(this.smoothedSemitones) < 0.05) {
      this.smoothedSemitones = 0;
      const frames = output[0].length;
      for (let ch = 0; ch < output.length; ch++) {
        const src = input[Math.min(ch, input.length - 1)];
        const dst = output[ch];
        for (let i = 0; i < frames; i++) {
          const s = src[i];
          this.rings[ch] && (this.rings[ch][(this.writeIndex + i) & this.bufferMask] = s);
          dst[i] = s;
        }
      }
      this.writeIndex = (this.writeIndex + frames) & this.bufferMask;
      return true;
    }

    const frames = output[0].length;
    const chCount = Math.min(2, output.length);
    const win = this.windowSize;
    const mask = this.bufferMask;
    const size = this.bufferSize;

    for (let i = 0; i < frames; i++) {
      this.smoothedSemitones += (targetSemitones - this.smoothedSemitones) * 0.004;
      const ratio = Math.pow(2, this.smoothedSemitones / 12);
      const phaseDelta = (1 - ratio) / win;

      let p1 = this.phase;
      let p2 = p1 + 0.5;
      if (p2 >= 1) p2 -= 1;

      const delay1 = p1 * win + 2;
      const delay2 = p2 * win + 2;

      const w1 = 0.5 * (1 - Math.cos(2 * Math.PI * p1));
      const w2 = 0.5 * (1 - Math.cos(2 * Math.PI * p2));

      const fIdx1 = this.writeIndex - delay1 + size;
      const i1a = Math.floor(fIdx1) & mask;
      const i1b = (i1a + 1) & mask;
      const frac1 = fIdx1 - Math.floor(fIdx1);

      const fIdx2 = this.writeIndex - delay2 + size;
      const i2a = Math.floor(fIdx2) & mask;
      const i2b = (i2a + 1) & mask;
      const frac2 = fIdx2 - Math.floor(fIdx2);

      for (let ch = 0; ch < chCount; ch++) {
        const src = input[Math.min(ch, input.length - 1)];
        const ring = this.rings[ch];
        ring[this.writeIndex] = src[i];

        const s1 = ring[i1a] + frac1 * (ring[i1b] - ring[i1a]);
        const s2 = ring[i2a] + frac2 * (ring[i2b] - ring[i2a]);
        output[ch][i] = s1 * w1 + s2 * w2;
      }

      if (output.length > 2) {
        for (let ch = 2; ch < output.length; ch++) {
          output[ch][i] = output[ch % chCount][i];
        }
      }

      this.writeIndex = (this.writeIndex + 1) & mask;
      this.phase += phaseDelta;
      if (this.phase >= 1) this.phase -= Math.floor(this.phase);
      else if (this.phase < 0) this.phase += Math.ceil(-this.phase);
    }

    return true;
  }
}

registerProcessor("${PITCH_WORKLET_PROCESSOR_NAME}", LirPitchShifterProcessor);
`;

const loadedContexts = new WeakSet<BaseAudioContext>();
const loadingContexts = new WeakMap<BaseAudioContext, Promise<boolean>>();

export async function ensurePitchShifterWorklet(ctx: AudioContext): Promise<boolean> {
  if (loadedContexts.has(ctx)) return true;
  if (!("audioWorklet" in ctx) || typeof ctx.audioWorklet?.addModule !== "function") {
    return false;
  }

  const existing = loadingContexts.get(ctx);
  if (existing) return existing;

  const promise = (async () => {
    let blobUrl: string | null = null;
    try {
      const blob = new Blob([PITCH_WORKLET_SOURCE], {
        type: "application/javascript",
      });
      blobUrl = URL.createObjectURL(blob);
      await ctx.audioWorklet.addModule(blobUrl);
      loadedContexts.add(ctx);
      return true;
    } catch (err) {
      console.warn("Pitch shifter AudioWorklet yüklenemedi:", err);
      return false;
    } finally {
      if (blobUrl) {
        URL.revokeObjectURL(blobUrl);
      }
      loadingContexts.delete(ctx);
    }
  })();

  loadingContexts.set(ctx, promise);
  return promise;
}

export function createPitchShifterNode(ctx: AudioContext): AudioWorkletNode | null {
  if (!loadedContexts.has(ctx)) return null;
  try {
    return new AudioWorkletNode(ctx, PITCH_WORKLET_PROCESSOR_NAME, {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      channelCount: 2,
      channelCountMode: "explicit",
    });
  } catch (err) {
    console.warn("Pitch shifter node oluşturulamadı:", err);
    return null;
  }
}
