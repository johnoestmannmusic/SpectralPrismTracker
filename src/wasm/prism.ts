import { audioClip, type AudioClip } from "@/core/dsp";
import {
  registerSpectralRenderer,
  sampleSpectralModulation,
  setSpectralWasmAvailable,
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
export function makeSpectralRenderer(wasm: PrismWasmModule): SyncSpectralRenderFn {
  return (a: AudioClip, b: AudioClip | null, settings: SpectralSettings): AudioClip => {
    const aFlat = flatten(a);
    const bFlat = b ? flatten(b) : new Float32Array(0);
    const { points, mask, numPoints } = sampleSpectralModulation(settings);
    let result: PrismWasmOutput;
    if (mask !== 0 && wasm.render_fused_modulated) {
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
    const frames = Math.floor(result.data.length / channelCount);
    const channels: Float32Array[] = [];
    for (let c = 0; c < channelCount; c++) {
      channels.push(result.data.slice(c * frames, (c + 1) * frames));
    }
    return audioClip(channels, Math.round(result.sampleRate));
  };
}

/** Registers a loaded prism_dsp WASM module with the Spectral engine, running renders on the main thread — the fallback used when the Spectral Worker is unavailable. */
export function registerPrismWasm(wasm: PrismWasmModule): void {
  const render = makeSpectralRenderer(wasm);
  registerSpectralRenderer((a, b, settings) => Promise.resolve(render(a, b, settings)));
  setSpectralWasmAvailable(true);
}

/** Registers an async Spectral renderer backed by the prism_dsp Worker. */
export function registerPrismWasmWorker(client: { render: SpectralRenderFn }): void {
  registerSpectralRenderer((a, b, settings) => client.render(a, b, settings));
  setSpectralWasmAvailable(true);
}
