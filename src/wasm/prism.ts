import { audioClip, type AudioClip } from "@/core/dsp";
import {
  registerSpectralRenderer,
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

/** Adapts a prism_dsp WASM module to the core Spectral renderer contract. */
export function makeSpectralRenderer(wasm: PrismWasmModule): SpectralRenderFn {
  return (a: AudioClip, b: AudioClip | null, settings: SpectralSettings): AudioClip => {
    const aFlat = flatten(a);
    const bFlat = b ? flatten(b) : new Float32Array(0);
    const result = wasm.render_fused(
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
    const channelCount = Math.max(result.channelCount, 1);
    const frames = Math.floor(result.data.length / channelCount);
    const channels: Float32Array[] = [];
    for (let c = 0; c < channelCount; c++) {
      channels.push(result.data.slice(c * frames, (c + 1) * frames));
    }
    return audioClip(channels, Math.round(result.sampleRate));
  };
}

/** Registers a loaded prism_dsp WASM module with the Spectral engine. */
export function registerPrismWasm(wasm: PrismWasmModule): void {
  registerSpectralRenderer(makeSpectralRenderer(wasm));
  setSpectralWasmAvailable(true);
}
