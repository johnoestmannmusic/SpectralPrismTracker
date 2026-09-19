import type { MasterFxSettings } from "@/core/masterFx";
import {
  DOWNSAMPLE_WORKLET_NAME,
  DOWNSAMPLE_WORKLET_URL,
} from "./downsampleWorklet";

export interface MasterFxGraph {
  input: AudioNode;
  output: AudioNode;
  update(settings: MasterFxSettings): void;
}

const DEFAULT_IR_DECAY = 2.0;

export interface MasterFxGraphOptions {
  /**
   * Build the end-of-chain downsampler as an AudioWorklet (live playback). The
   * offline export applies the same algorithm as a deterministic buffer pass
   * instead, because a worklet rendered offline is not reproducible.
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

  // Direct path until (and unless) the downsampler is switched on. The stage is
  // a worklet (audio thread) followed by an optional native low-pass; a disabled
  // effect is a true bypass (BUG-39).
  mix.connect(output);
  let worklet: AudioWorkletNode | null = null;
  let lowpass: BiquadFilterNode | null = null;
  let stageReady = false;
  let stageWired = false;

  const applyDownsampleParams = () => {
    if (worklet) {
      const now = ctx.currentTime;
      worklet.parameters
        .get("rateHz")
        ?.setValueAtTime(current.downsample.rateHz, now);
      worklet.parameters
        .get("lowpassOn")
        ?.setValueAtTime(current.downsample.lowpassEnabled ? 1 : 0, now);
      worklet.parameters
        .get("lowpassHz")
        ?.setValueAtTime(current.downsample.lowpassHz, now);
    }
    if (lowpass) {
      lowpass.frequency.setValueAtTime(
        current.downsample.lowpassEnabled
          ? current.downsample.lowpassHz
          : ctx.sampleRate * 0.499,
        ctx.currentTime,
      );
    }
  };

  const wireStage = () => {
    if (!stageReady || !worklet || !lowpass) return;
    const want = current.downsample.enabled;
    if (want === stageWired) return;
    if (want) {
      try {
        mix.disconnect(output);
      } catch {
        /* not connected */
      }
      mix.connect(worklet);
      worklet.connect(lowpass);
      lowpass.connect(output);
      stageWired = true;
    } else {
      try {
        mix.disconnect(worklet);
      } catch {
        /* not connected */
      }
      try {
        worklet.disconnect();
      } catch {
        /* not connected */
      }
      try {
        lowpass.disconnect();
      } catch {
        /* not connected */
      }
      mix.connect(output);
      stageWired = false;
    }
  };

  if (options.realtimeDownsample) {
    void (async () => {
      try {
        await ctx.audioWorklet.addModule(DOWNSAMPLE_WORKLET_URL);
        worklet = new AudioWorkletNode(ctx, DOWNSAMPLE_WORKLET_NAME, {
          numberOfInputs: 1,
          numberOfOutputs: 1,
          outputChannelCount: [2],
        });
        lowpass = ctx.createBiquadFilter();
        lowpass.type = "lowpass";
        lowpass.Q.value = 0.707;
        stageReady = true;
        applyDownsampleParams();
        wireStage();
      } catch {
        // Leave the effect bypassed if the worklet cannot load.
        stageReady = false;
      }
    })();
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
    if (options.realtimeDownsample) {
      applyDownsampleParams();
      wireStage();
    }
  };

  update(initial);
  return { input, output, update };
}
