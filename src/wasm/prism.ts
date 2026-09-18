import { audioClip, type AudioClip } from "@/core/dsp";
import {
  LOOP_LENGTH_CROSSFADE_SECONDS,
  LOOP_LENGTH_SEGMENTS,
  SPECTRAL_PARAMS,
  registerSpectralRenderer,
  sampleSpectralModulation,
  setSpectralWasmAvailable,
  SPECTRAL_ROOT_NOTE,
  type SpectralRenderFn,
  type SpectralSettings,
} from "@/core/spectral";

export interface PrismWasmOutput {
  channelCount: number;
  sampleRate: number;
  data: Float32Array;
}

export interface PrismWasmModule {
  render_fused(
    aFlat: Float32Array,
    aChannels: number,
    bFlat: Float32Array,
    bChannels: number,
    sampleRate: number,
    freezePointA: number,
    volumeA: number,
    tuneA: number,
    formantA: number,
    mode: string,
    freezePointB: number,
    formantB: number,
    volumeB: number,
    tuneB: number,
    mixAmount: number,
    crossSynthAmount: number,
    convolveAmount: number,
    ringModAmount: number,
    stereoWidth: number,
    loopLengthSeconds: number,
  ): PrismWasmOutput;
  /**
   * Modulated sibling of `render_fused`. Optional so an older WASM build still
   * works (the renderer falls back to `render_fused`). `tracksFlat` is
   * `SPECTRAL_PARAMS.length * numPoints` absolute values in the fixed target
   * order; `trackMask` selects which targets vary.
   */
  render_fused_modulated?(
    aFlat: Float32Array,
    aChannels: number,
    bFlat: Float32Array,
    bChannels: number,
    sampleRate: number,
    freezePointA: number,
    volumeA: number,
    tuneA: number,
    formantA: number,
    mode: string,
    freezePointB: number,
    formantB: number,
    volumeB: number,
    tuneB: number,
    mixAmount: number,
    crossSynthAmount: number,
    convolveAmount: number,
    ringModAmount: number,
    stereoWidth: number,
    loopLengthSeconds: number,
    tracksFlat: Float32Array,
    numPoints: number,
    trackMask: number,
  ): PrismWasmOutput;
  /**
   * Structural Loop-Length sibling of `render_fused_modulated`: renders
   * `numSegments` phase-locked loops of different lengths and tiles them into
   * one fixed-length super-loop. Optional so an older WASM build still works.
   */
  render_fused_loop_lengths?(
    aFlat: Float32Array,
    aChannels: number,
    bFlat: Float32Array,
    bChannels: number,
    sampleRate: number,
    freezePointA: number,
    volumeA: number,
    tuneA: number,
    formantA: number,
    mode: string,
    freezePointB: number,
    formantB: number,
    volumeB: number,
    tuneB: number,
    mixAmount: number,
    crossSynthAmount: number,
    convolveAmount: number,
    ringModAmount: number,
    stereoWidth: number,
    loopLengthSeconds: number,
    tracksFlat: Float32Array,
    numPoints: number,
    trackMask: number,
    numSegments: number,
    crossfadeSeconds: number,
  ): PrismWasmOutput;
  /**
   * Percussion post-stage: takes the fused output of any Fusion mode as flat
   * interleaved PCM and returns a short one-shot. Optional so an older WASM
   * build still works (percussion is then skipped).
   */
  render_percussion?(
    fusedFlat: Float32Array,
    fusedChannels: number,
    sampleRate: number,
    rootNote: number,
    noiseAmountPct: number,
    noiseColor: string,
    noiseDecaySeconds: number,
    transientAmountPct: number,
    transientDecaySeconds: number,
    transientFrequencyHz: number,
    pitchStartSemitones: number,
    pitchEndSemitones: number,
    pitchDecaySeconds: number,
    ampDecaySeconds: number,
    bodyAmountPct: number,
    partialCount: number,
    partialDecaySeconds: number,
    digitalAmountPct: number,
    driveAmountPct: number,
    compressAmountPct: number,
    stereoWidthPct: number,
    lengthSeconds: number,
  ): PrismWasmOutput;
  /**
   * MicroTextures post-stage: granular re-texturing + formant filter +
   * retrigger + bit-crush. Optional so an older WASM build still works.
   */
  render_microtextures?(
    fusedFlat: Float32Array,
    fusedChannels: number,
    sampleRate: number,
    rootNote: number,
    grainSeconds: number,
    densityHz: number,
    jitter: number,
    reverseProbability: number,
    pitchScatterSemitones: number,
    panScatter: number,
    volumeVariance: number,
    densityModRateHz: number,
    densityModDepth: number,
    grainChaos: number,
    retriggerHz: number,
    retriggerAmount: number,
    bitDepth: number,
    downsample: number,
    formantShiftSemitones: number,
    formantResonance: number,
    formantMix: number,
  ): PrismWasmOutput;
}

function flatten(clip: AudioClip): Float32Array {
  const total = clip.channels.reduce((sum, channel) => sum + channel.length, 0);
  const out = new Float32Array(total);
  let offset = 0;
  for (const channel of clip.channels) {
    out.set(channel, offset);
    offset += channel.length;
  }
  return out;
}

/** A direct, synchronous call into a loaded prism_dsp WASM module. */
export type SyncSpectralRenderFn = (
  a: AudioClip,
  b: AudioClip | null,
  settings: SpectralSettings,
) => AudioClip;

/** Adapts a prism_dsp WASM module to a synchronous render function — usable directly in tests, or inside the Spectral Worker where the WASM call itself is on-thread. */
export function makeSpectralRenderer(
  wasm: PrismWasmModule,
): SyncSpectralRenderFn {
  return (
    a: AudioClip,
    b: AudioClip | null,
    settings: SpectralSettings,
  ): AudioClip => {
    const aFlat = flatten(a);
    const bFlat = b ? flatten(b) : new Float32Array(0);
    const { points, mask, numPoints } = sampleSpectralModulation(settings);
    const loopLengthTarget = SPECTRAL_PARAMS.find(
      (param) => param.id === "loopLength",
    );
    const loopLengthMask =
      loopLengthTarget === undefined ? 0 : mask & (1 << loopLengthTarget.index);
    let result: PrismWasmOutput;
    if (loopLengthMask !== 0 && wasm.render_fused_loop_lengths) {
      result = wasm.render_fused_loop_lengths(
        aFlat,
        a.channels.length,
        bFlat,
        b ? b.channels.length : 0,
        a.sampleRate,
        settings.freezePoint,
        settings.volume,
        settings.tune,
        settings.formantShift,
        settings.mode,
        settings.freezePointB,
        settings.formantShiftB,
        settings.volumeB,
        settings.tuneB,
        settings.mixAmount,
        settings.crossSynthAmount,
        settings.convolveAmount,
        settings.ringModAmount,
        settings.stereoWidth,
        settings.loopLengthSeconds,
        points,
        numPoints,
        mask,
        LOOP_LENGTH_SEGMENTS,
        LOOP_LENGTH_CROSSFADE_SECONDS,
      );
    } else if (mask !== 0 && wasm.render_fused_modulated) {
      result = wasm.render_fused_modulated(
        aFlat,
        a.channels.length,
        bFlat,
        b ? b.channels.length : 0,
        a.sampleRate,
        settings.freezePoint,
        settings.volume,
        settings.tune,
        settings.formantShift,
        settings.mode,
        settings.freezePointB,
        settings.formantShiftB,
        settings.volumeB,
        settings.tuneB,
        settings.mixAmount,
        settings.crossSynthAmount,
        settings.convolveAmount,
        settings.ringModAmount,
        settings.stereoWidth,
        settings.loopLengthSeconds,
        points,
        numPoints,
        mask,
      );
    } else {
      result = wasm.render_fused(
        aFlat,
        a.channels.length,
        bFlat,
        b ? b.channels.length : 0,
        a.sampleRate,
        settings.freezePoint,
        settings.volume,
        settings.tune,
        settings.formantShift,
        settings.mode,
        settings.freezePointB,
        settings.formantShiftB,
        settings.volumeB,
        settings.tuneB,
        settings.mixAmount,
        settings.crossSynthAmount,
        settings.convolveAmount,
        settings.ringModAmount,
        settings.stereoWidth,
        settings.loopLengthSeconds,
      );
    }
    const channelCount = Math.max(result.channelCount, 1);
    if (settings.percussion.enabled && wasm.render_percussion) {
      const p = settings.percussion;
      result = wasm.render_percussion(
        result.data,
        channelCount,
        result.sampleRate,
        SPECTRAL_ROOT_NOTE,
        p.noiseAmount,
        p.noiseColor,
        p.noiseDecay,
        p.transientAmount,
        p.transientDecay,
        p.transientFrequency,
        p.pitchStart,
        p.pitchEnd,
        p.pitchDecay,
        p.ampDecay,
        p.bodyAmount,
        p.partialCount,
        p.partialDecay,
        p.digitalAmount,
        p.driveAmount,
        p.compressAmount,
        p.stereoWidth,
        p.lengthSeconds,
      );
    }
    const micro = settings.microTextures;
    if (micro.enabled && wasm.render_microtextures) {
      result = wasm.render_microtextures(
        result.data,
        Math.max(result.channelCount, 1),
        result.sampleRate,
        SPECTRAL_ROOT_NOTE,
        micro.grainSeconds,
        micro.densityHz,
        micro.jitter,
        micro.reverseProbability,
        micro.pitchScatter,
        micro.panScatter,
        micro.volumeVariance,
        micro.densityModRate,
        micro.densityModDepth,
        micro.grainChaos,
        micro.retriggerHz,
        micro.retriggerAmount,
        micro.bitDepth,
        micro.downsample,
        micro.formantShift,
        micro.formantResonance,
        micro.formantMix,
      );
    }
    const outChannels = Math.max(result.channelCount, 1);
    const outFrames = Math.floor(result.data.length / outChannels);
    const channels: Float32Array[] = [];
    for (let c = 0; c < outChannels; c++) {
      channels.push(result.data.slice(c * outFrames, (c + 1) * outFrames));
    }
    return audioClip(channels, Math.round(result.sampleRate));
  };
}

/** Registers a loaded prism_dsp WASM module with the Spectral engine, running renders on the main thread — the fallback used when the Spectral Worker is unavailable. */
export function registerPrismWasm(wasm: PrismWasmModule): void {
  const render = makeSpectralRenderer(wasm);
  registerSpectralRenderer((a, b, settings) =>
    Promise.resolve(render(a, b, settings)),
  );
  setSpectralWasmAvailable(true);
}

/** Registers an async Spectral renderer backed by the prism_dsp Worker. */
export function registerPrismWasmWorker(client: {
  render: SpectralRenderFn;
}): void {
  registerSpectralRenderer((a, b, settings) => client.render(a, b, settings));
  setSpectralWasmAvailable(true);
}
