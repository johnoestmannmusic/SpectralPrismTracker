import type { MasterFxSettings } from "@/core/masterFx";

export interface MasterFxGraph {
  input: AudioNode;
  output: AudioNode;
  update(settings: MasterFxSettings): void;
}

const DEFAULT_IR_DECAY = 2.0;
/** ScriptProcessor block size for the realtime downsampler. */
const DOWNSAMPLE_BUFFER = 256;

export interface MasterFxGraphOptions {
  /**
   * Insert a realtime sample-and-hold downsampler at the end of the chain. The
   * offline export applies the same algorithm as a deterministic buffer pass
   * instead (a `ScriptProcessorNode` rendered offline is not reproducible).
   */
  realtimeDownsample?: boolean;
}

/**
 * Builds the master-output effect chain (dry + delay + convolution reverb,
 * optionally + end-of-chain downsample) on any `BaseAudioContext` so playback
 * and export share the same effects.
 */
export function createMasterFxGraph(
  ctx: BaseAudioContext,
  initial: MasterFxSettings,
  options: MasterFxGraphOptions = {},
): MasterFxGraph {
  const input = ctx.createGain();
  /** Everything (dry + delay + reverb) sums here, before the downsampler. */
  const mix = ctx.createGain();
  const output = ctx.createGain();
  input.connect(mix); // dry

  const delayNode = ctx.createDelay(5.0);
  const delayTone = ctx.createBiquadFilter();
  delayTone.type = "lowpass";
  const delayFeedback = ctx.createGain();
  const delayWet = ctx.createGain();
  input.connect(delayNode);
  delayNode.connect(delayTone);
  delayTone.connect(delayWet);
  delayWet.connect(mix);
  delayTone.connect(delayFeedback);
  delayFeedback.connect(delayNode);

  const reverbConvolver = ctx.createConvolver();
  const reverbWet = ctx.createGain();
  input.connect(reverbConvolver);
  reverbConvolver.connect(reverbWet);
  reverbWet.connect(mix);

  let current = initial;

  if (options.realtimeDownsample) {
    // Always present in the live chain; when disabled it holds every sample,
    // i.e. passes through unchanged.
    try {
      const downsample = ctx.createScriptProcessor(DOWNSAMPLE_BUFFER, 2, 2);
      // Per-channel sample-and-hold state, carried across blocks. Mirrors the
      // deterministic offline `downsampleClip` (hold index = floor(n * ratio)).
      const held = [0, 0];
      const lastSource = [-1, -1];
      const count = [0, 0];
      downsample.onaudioprocess = (event) => {
        const inBuffer = event.inputBuffer;
        const outBuffer = event.outputBuffer;
        const inChannels = inBuffer.numberOfChannels;
        const target = current.downsample.enabled
          ? current.downsample.rateHz
          : ctx.sampleRate;
        const ratio = Math.min(1, Math.max(0.0001, target / ctx.sampleRate));
        for (let c = 0; c < outBuffer.numberOfChannels; c++) {
          const outData = outBuffer.getChannelData(c);
          if (inChannels === 0) {
            outData.fill(0);
            continue;
          }
          const inData = inBuffer.getChannelData(Math.min(c, inChannels - 1));
          let hold = held[c] ?? 0;
          let source = lastSource[c] ?? -1;
          let n = count[c] ?? 0;
          for (let i = 0; i < outData.length; i++) {
            const wanted = Math.floor(n * ratio);
            if (wanted !== source || n === 0) {
              hold = inData[i] ?? hold;
              source = wanted;
            }
            outData[i] = hold;
            n++;
          }
          held[c] = hold;
          lastSource[c] = source;
          count[c] = n;
        }
      };
      mix.connect(downsample);
      downsample.connect(output);
    } catch {
      mix.connect(output);
    }
  } else {
    mix.connect(output);
  }

  let lastDecay = -1;

  const regenerateImpulse = () => {
    const decay = Math.max(0.1, current.reverb.decaySec || DEFAULT_IR_DECAY);
    if (Math.abs(decay - lastDecay) < 1e-6) return;
    lastDecay = decay;
    const length = Math.max(1, Math.floor(ctx.sampleRate * decay));
    const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const data = buffer.getChannelData(c);
      for (let i = 0; i < length; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 2.2);
      }
    }
    reverbConvolver.buffer = buffer;
  };

  const update = (settings: MasterFxSettings) => {
    current = settings;
    const now = ctx.currentTime;
    delayNode.delayTime.setValueAtTime(
      Math.max(0.001, settings.delay.timeSec),
      now,
    );
    delayFeedback.gain.setValueAtTime(
      settings.delay.enabled
        ? Math.min(Math.max(settings.delay.feedback, 0), 0.95)
        : 0,
      now,
    );
    delayTone.frequency.setValueAtTime(
      Math.max(200, settings.delay.toneHz),
      now,
    );
    delayWet.gain.setValueAtTime(
      settings.delay.enabled ? Math.min(Math.max(settings.delay.mix, 0), 1) : 0,
      now,
    );
    reverbWet.gain.setValueAtTime(
      settings.reverb.enabled
        ? Math.min(Math.max(settings.reverb.mix, 0), 1)
        : 0,
      now,
    );
    regenerateImpulse();
  };

  update(initial);
  return { input, output, update };
}
