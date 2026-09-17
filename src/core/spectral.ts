import { audioClip, clipDuration, clipIsEmpty, type AudioClip } from "./dsp";

export const MIN_LOOP_SECONDS = 0.5;
export const MAX_LOOP_SECONDS = 8.0;
export const DEFAULT_LOOP_SECONDS = 4.0;

/** Stable kebab-case keys used in Project JSON. */
export type SpectralFusionMode =
  | "off"
  | "mix"
  | "cross-synth"
  | "convolve"
  | "ring-modulate"
  | "spectral-max"
  | "spectral-min"
  | "cycle";

export const SPECTRAL_FUSION_MODES: SpectralFusionMode[] = [
  "off",
  "mix",
  "cross-synth",
  "convolve",
  "ring-modulate",
  "spectral-max",
  "spectral-min",
  "cycle",
];

export function spectralModeLabel(mode: SpectralFusionMode): string {
  switch (mode) {
    case "off":
      return "Off (Freeze A only)";
    case "mix":
      return "Mix";
    case "cross-synth":
      return "Cross-Synth";
    case "convolve":
      return "Convolve";
    case "ring-modulate":
      return "Ring Modulate";
    case "spectral-max":
      return "Spectral Max";
    case "spectral-min":
      return "Spectral Min";
    case "cycle":
      return "Cycle";
  }
}

export function spectralModeNeedsB(mode: SpectralFusionMode): boolean {
  return mode !== "off";
}

export function spectralModeHasAmount(mode: SpectralFusionMode): boolean {
  return (
    mode === "mix" || mode === "cross-synth" || mode === "convolve" || mode === "ring-modulate"
  );
}

/**
 * Every parameter that contributes to the SpectralPrism output can be
 * modulated over the rendered loop. The string ids are stable Project JSON
 * keys; `index` MUST match the fixed target order in prism_dsp's
 * `modulate.rs` (`MOD_*` constants), since the renderer packs control points
 * into a flat array in that order.
 */
export type SpectralParamId =
  | "freezePointA"
  | "freezePointB"
  | "tuneA"
  | "tuneB"
  | "volumeA"
  | "volumeB"
  | "formantA"
  | "formantB"
  | "stereoWidth"
  | "mixAmount"
  | "crossSynthAmount"
  | "convolveAmount"
  | "ringModAmount";

export type SpectralModShape = "lfo" | "ramp" | "random";

export const SPECTRAL_MOD_SHAPES: SpectralModShape[] = ["lfo", "ramp", "random"];

export interface SpectralModRoute {
  target: SpectralParamId;
  shape: SpectralModShape;
  /** Modulation amount, in the target's own units (semitones / %). */
  depth: number;
  /** Cycles per second (LFO shape). */
  rateHz: number;
  /** LFO phase offset, 0..1. */
  phase: number;
  /** true = sweep ±depth; false = sweep 0..depth. */
  bipolar: boolean;
}

export interface SpectralParamMeta {
  id: SpectralParamId;
  label: string;
  unit: string;
  min: number;
  max: number;
  /** Index in the prism_dsp modulation target order (must match modulate.rs). */
  index: number;
  /** Fusion modes this target applies to; undefined = always available. */
  modes?: SpectralFusionMode[];
}

const B_MODES = SPECTRAL_FUSION_MODES.filter((mode) => mode !== "off");

export const SPECTRAL_PARAMS: SpectralParamMeta[] = [
  {
    id: "freezePointA",
    label: "Freeze Point A",
    unit: "%",
    min: 0,
    max: 100,
    index: 0,
  },
  {
    id: "freezePointB",
    label: "Freeze Point B",
    unit: "%",
    min: 0,
    max: 100,
    index: 1,
    modes: B_MODES,
  },
  { id: "tuneA", label: "Tune A", unit: "st", min: -24, max: 24, index: 2 },
  {
    id: "tuneB",
    label: "Tune B",
    unit: "st",
    min: -24,
    max: 24,
    index: 3,
    modes: B_MODES,
  },
  { id: "volumeA", label: "Volume A", unit: "%", min: 0, max: 100, index: 4 },
  {
    id: "volumeB",
    label: "Volume B",
    unit: "%",
    min: 0,
    max: 100,
    index: 5,
    modes: B_MODES,
  },
  {
    id: "formantA",
    label: "Formant A",
    unit: "st",
    min: -12,
    max: 12,
    index: 6,
  },
  {
    id: "formantB",
    label: "Formant B",
    unit: "st",
    min: -12,
    max: 12,
    index: 7,
    modes: B_MODES,
  },
  {
    id: "stereoWidth",
    label: "Stereo Width",
    unit: "%",
    min: 0,
    max: 100,
    index: 8,
  },
  {
    id: "mixAmount",
    label: "Mix Amount",
    unit: "%",
    min: 0,
    max: 100,
    index: 9,
    modes: ["mix"],
  },
  {
    id: "crossSynthAmount",
    label: "Cross-Synth Amount",
    unit: "%",
    min: 0,
    max: 100,
    index: 10,
    modes: ["cross-synth"],
  },
  {
    id: "convolveAmount",
    label: "Convolve Amount",
    unit: "%",
    min: 0,
    max: 100,
    index: 11,
    modes: ["convolve"],
  },
  {
    id: "ringModAmount",
    label: "Ring Mod Amount",
    unit: "%",
    min: 0,
    max: 100,
    index: 12,
    modes: ["ring-modulate"],
  },
];

/** The current (unmodulated) value of a target, used as the modulation base. */
export function spectralBaseValue(settings: SpectralSettings, id: SpectralParamId): number {
  switch (id) {
    case "freezePointA":
      return settings.freezePoint;
    case "freezePointB":
      return settings.freezePointB;
    case "tuneA":
      return settings.tune;
    case "tuneB":
      return settings.tuneB;
    case "volumeA":
      return settings.volume;
    case "volumeB":
      return settings.volumeB;
    case "formantA":
      return settings.formantShift;
    case "formantB":
      return settings.formantShiftB;
    case "stereoWidth":
      return settings.stereoWidth;
    case "mixAmount":
      return settings.mixAmount;
    case "crossSynthAmount":
      return settings.crossSynthAmount;
    case "convolveAmount":
      return settings.convolveAmount;
    case "ringModAmount":
      return settings.ringModAmount;
  }
}

export function spectralParamMeta(id: SpectralParamId): SpectralParamMeta {
  return SPECTRAL_PARAMS.find((p) => p.id === id) ?? SPECTRAL_PARAMS[0]!;
}

/** True when at least one non-zero-depth route targets `id`. */
export function spectralParamIsModulated(settings: SpectralSettings, id: SpectralParamId): boolean {
  return settings.modulation.some((route) => route.target === id && route.depth !== 0);
}

/** Control points supplied per target. Must match what the renderer passes as `num_points`. */
export const MOD_CONTROL_POINTS = 128;

function pseudoRandom(n: number): number {
  const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
  return (x - Math.floor(x)) * 2 - 1;
}

function modShapeValue(
  shape: SpectralModShape,
  rateHz: number,
  phase: number,
  i: number,
  numPoints: number,
  durationSeconds: number,
): number {
  switch (shape) {
    case "lfo": {
      const t = (i / numPoints) * durationSeconds;
      return Math.sin(2 * Math.PI * (rateHz * t + phase));
    }
    case "ramp":
      return (i / numPoints) * 2 - 1;
    case "random":
      return pseudoRandom(phase * 1000 + i);
  }
}

/**
 * Samples every route into a flat `SPECTRAL_PARAMS.length * numPoints` array
 * of absolute per-control-point values, plus a bitmask of targets that
 * actually vary. Called on the renderer side (main thread or Worker) right
 * before dispatch, so no track data needs to cross the Worker boundary.
 */
export function sampleSpectralModulation(settings: SpectralSettings): {
  points: Float32Array;
  mask: number;
  numPoints: number;
} {
  const numPoints = MOD_CONTROL_POINTS;
  const points = new Float32Array(SPECTRAL_PARAMS.length * numPoints);
  let mask = 0;
  const duration = Math.max(settings.loopLengthSeconds, 0.001);

  for (const meta of SPECTRAL_PARAMS) {
    const base = spectralBaseValue(settings, meta.id);
    const routes = settings.modulation.filter((route) => route.target === meta.id);
    const start = meta.index * numPoints;
    if (routes.length === 0) {
      points.fill(base, start, start + numPoints);
      continue;
    }
    let active = false;
    for (let i = 0; i < numPoints; i++) {
      let value = base;
      for (const route of routes) {
        if (route.depth === 0) continue;
        active = true;
        const raw = modShapeValue(route.shape, route.rateHz, route.phase, i, numPoints, duration);
        const shaped = route.bipolar ? raw : (raw + 1) / 2;
        value += route.depth * shaped;
      }
      points[start + i] = Math.min(Math.max(value, meta.min), meta.max);
    }
    if (active) mask |= 1 << meta.index;
  }

  return { points, mask, numPoints };
}

export interface SpectralSettings {
  enabled: boolean;
  sourceIndex2: number | null;
  mode: SpectralFusionMode;
  freezePoint: number;
  freezePointB: number;
  tune: number;
  tuneB: number;
  formantShift: number;
  formantShiftB: number;
  volume: number;
  volumeB: number;
  mixAmount: number;
  crossSynthAmount: number;
  convolveAmount: number;
  ringModAmount: number;
  stereoWidth: number;
  loopLengthSeconds: number;
  /** Per-parameter modulation routes baked into the rendered result. */
  modulation: SpectralModRoute[];
  savedStartSec: number;
  savedEndSec: number;
  /** Sampler's loop flag, restored when Spectral is switched off. */
  savedLooping: boolean;
}

export function defaultSpectralSettings(): SpectralSettings {
  return {
    enabled: false,
    sourceIndex2: null,
    mode: "off",
    freezePoint: 50,
    freezePointB: 50,
    tune: 0,
    tuneB: 0,
    formantShift: 0,
    formantShiftB: 0,
    volume: 100,
    volumeB: 100,
    mixAmount: 50,
    crossSynthAmount: 100,
    convolveAmount: 100,
    ringModAmount: 100,
    stereoWidth: 30,
    loopLengthSeconds: DEFAULT_LOOP_SECONDS,
    modulation: [],
    savedStartSec: 0,
    savedEndSec: 0,
    savedLooping: false,
  };
}

/** True once the prism_dsp WASM module has been initialised. */
let wasmAvailable = false;
export function setSpectralWasmAvailable(available: boolean): void {
  wasmAvailable = available;
}
export function spectralWasmAvailable(): boolean {
  return wasmAvailable;
}

export interface SpectralRenderFn {
  (a: AudioClip, b: AudioClip | null, settings: SpectralSettings): Promise<AudioClip>;
}

let renderImpl: SpectralRenderFn | null = null;
export function registerSpectralRenderer(fn: SpectralRenderFn | null): void {
  renderImpl = fn;
}

/**
 * Renders Sample A (required) optionally fused with Sample B through the
 * prism_dsp WASM module (on the Spectral Worker when available, else the
 * main thread), normalised so the loudest sample hits full scale.
 */
export async function spectralRender(
  a: AudioClip,
  b: AudioClip | null,
  settings: SpectralSettings,
): Promise<AudioClip> {
  if (clipIsEmpty(a)) throw new Error("Sample A is empty");
  if (spectralModeNeedsB(settings.mode) && (!b || clipIsEmpty(b))) {
    throw new Error("Sample B is required");
  }
  if (!renderImpl) {
    throw new Error("Spectral engine (prism_dsp WASM) is not available yet");
  }
  const clip = await renderImpl(a, b, settings);
  normalizePeak(clip.channels);
  return clip;
}

export { clipDuration };

function normalizePeak(channels: Float32Array[]): void {
  let peak = 0;
  for (const channel of channels) {
    for (let i = 0; i < channel.length; i++) {
      const v = Math.abs(channel[i]!);
      if (v > peak) peak = v;
    }
  }
  if (peak <= 1e-9 || !Number.isFinite(peak)) return;
  const gain = 1 / peak;
  for (const channel of channels) {
    for (let i = 0; i < channel.length; i++) channel[i] = channel[i]! * gain;
  }
}

/** Convenience used by tests to build a clip from plain arrays. */
export function makeClip(channels: number[][], sampleRate: number): AudioClip {
  return audioClip(
    channels.map((c) => Float32Array.from(c)),
    sampleRate,
  );
}
