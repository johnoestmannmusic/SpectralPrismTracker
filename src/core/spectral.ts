import { audioClip, clipDuration, clipIsEmpty, type AudioClip } from "./dsp";

export const MIN_LOOP_SECONDS = 0.5;
export const MAX_LOOP_SECONDS = 8.0;
export const DEFAULT_LOOP_SECONDS = 4.0;
/** Must match `prism_dsp::render::DEFAULT_ROOT_NOTE`; the tracker note is applied as playback rate. */
export const SPECTRAL_ROOT_NOTE = 60;

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
    mode === "mix" ||
    mode === "cross-synth" ||
    mode === "convolve" ||
    mode === "ring-modulate"
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
  | "ringModAmount"
  | "loopLength";

export type SpectralModShape = "lfo" | "ramp" | "random";

export const SPECTRAL_MOD_SHAPES: SpectralModShape[] = [
  "lfo",
  "ramp",
  "random",
];

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
  {
    id: "loopLength",
    label: "Loop Length",
    unit: "s",
    min: MIN_LOOP_SECONDS,
    max: MAX_LOOP_SECONDS,
    index: 13,
  },
];

/** The current (unmodulated) value of a target, used as the modulation base. */
export function spectralBaseValue(
  settings: SpectralSettings,
  id: SpectralParamId,
): number {
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
    case "loopLength":
      return settings.loopLengthSeconds;
  }
}

export function spectralParamMeta(id: SpectralParamId): SpectralParamMeta {
  return SPECTRAL_PARAMS.find((p) => p.id === id) ?? SPECTRAL_PARAMS[0]!;
}

/** True when at least one non-zero-depth route targets `id`. */
export function spectralParamIsModulated(
  settings: SpectralSettings,
  id: SpectralParamId,
): boolean {
  return settings.modulation.some(
    (route) => route.target === id && route.depth !== 0,
  );
}

/** Control points supplied per target. Must match what the renderer passes as `num_points`. */
export const MOD_CONTROL_POINTS = 128;
/** Phase-locked segments a loop-length sweep is tiled from. Mirrors prism_dsp's `LOOP_LENGTH_SEGMENTS`. */
export const LOOP_LENGTH_SEGMENTS = 8;
/** Crossfade at loop-length joins and the super-loop seam, in seconds. Mirrors prism_dsp. */
export const LOOP_LENGTH_CROSSFADE_SECONDS = 0.006;

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
    const routes = settings.modulation.filter(
      (route) => route.target === meta.id,
    );
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
        const raw = modShapeValue(
          route.shape,
          route.rateHz,
          route.phase,
          i,
          numPoints,
          duration,
        );
        const shaped = route.bipolar ? raw : (raw + 1) / 2;
        value += route.depth * shaped;
      }
      points[start + i] = Math.min(Math.max(value, meta.min), meta.max);
    }
    if (active) mask |= 1 << meta.index;
  }

  return { points, mask, numPoints };
}

export type PercussionNoiseColor = "white" | "pink" | "band-limited";
export const PERCUSSION_NOISE_COLORS: PercussionNoiseColor[] = [
  "white",
  "pink",
  "band-limited",
];

/**
 * Percussion is a third pipeline step that runs *after* Fusion for any mode:
 * it takes the fused loop and re-synthesizes it as a short one-shot
 * (modal body + noise + transient + pitch/amp envelopes). Params mirror
 * `prism_dsp::percussion::PercussionParams`. Disabled by default so legacy
 * projects and non-percussion instruments are unchanged.
 */
export interface PercussionSettings {
  enabled: boolean;
  noiseAmount: number;
  noiseColor: PercussionNoiseColor;
  noiseDecay: number;
  transientAmount: number;
  transientDecay: number;
  transientFrequency: number;
  /** Semitone offset at the start of the pitch envelope. */
  pitchStart: number;
  /** Semitone offset at the end of the pitch envelope. */
  pitchEnd: number;
  pitchDecay: number;
  ampDecay: number;
  bodyAmount: number;
  partialCount: number;
  partialDecay: number;
  digitalAmount: number;
  /** Saturation/overdrive 0-100; 0 is bypassed. */
  driveAmount: number;
  /** Feed-forward peak compression 0-100; 0 is bypassed. */
  compressAmount: number;
  stereoWidth: number;
  lengthSeconds: number;
}

export type PercussionPreset = "kick" | "snare" | "metal" | "hat";
export const PERCUSSION_PRESETS: PercussionPreset[] = [
  "kick",
  "snare",
  "metal",
  "hat",
];

const PERCUSSION_PRESET_VALUES: Record<
  PercussionPreset,
  Omit<PercussionSettings, "enabled">
> = {
  kick: {
    noiseAmount: 8,
    noiseColor: "white",
    noiseDecay: 0.04,
    transientAmount: 60,
    transientDecay: 0.005,
    transientFrequency: 2000,
    pitchStart: 30,
    pitchEnd: -28,
    pitchDecay: 0.04,
    ampDecay: 0.3,
    bodyAmount: 100,
    partialCount: 12,
    partialDecay: 0.35,
    digitalAmount: 0,
    driveAmount: 0,
    compressAmount: 0,
    stereoWidth: 20,
    lengthSeconds: 0.6,
  },
  snare: {
    noiseAmount: 75,
    noiseColor: "white",
    noiseDecay: 0.2,
    transientAmount: 70,
    transientDecay: 0.005,
    transientFrequency: 2400,
    pitchStart: 12,
    pitchEnd: -12,
    pitchDecay: 0.02,
    ampDecay: 0.24,
    bodyAmount: 60,
    partialCount: 16,
    partialDecay: 0.18,
    digitalAmount: 10,
    driveAmount: 0,
    compressAmount: 0,
    stereoWidth: 60,
    lengthSeconds: 0.4,
  },
  metal: {
    noiseAmount: 20,
    noiseColor: "band-limited",
    noiseDecay: 0.18,
    transientAmount: 45,
    transientDecay: 0.007,
    transientFrequency: 3600,
    pitchStart: 14,
    pitchEnd: -20,
    pitchDecay: 0.045,
    ampDecay: 0.5,
    bodyAmount: 90,
    partialCount: 24,
    partialDecay: 0.4,
    digitalAmount: 45,
    driveAmount: 0,
    compressAmount: 0,
    stereoWidth: 80,
    lengthSeconds: 0.9,
  },
  hat: {
    noiseAmount: 92,
    noiseColor: "band-limited",
    noiseDecay: 0.07,
    transientAmount: 55,
    transientDecay: 0.0025,
    transientFrequency: 8500,
    pitchStart: 0,
    pitchEnd: 0,
    pitchDecay: 0.05,
    ampDecay: 0.09,
    bodyAmount: 20,
    partialCount: 8,
    partialDecay: 0.05,
    digitalAmount: 0,
    driveAmount: 0,
    compressAmount: 0,
    stereoWidth: 50,
    lengthSeconds: 0.18,
  },
};

export function percussionPreset(name: PercussionPreset): PercussionSettings {
  return { enabled: true, ...PERCUSSION_PRESET_VALUES[name] };
}

/**
 * Which built-in preset the current percussion params match, or `custom` once
 * any value has been tweaked. Used to label the editor's preset control.
 */
export function percussionPresetName(
  settings: PercussionSettings,
): PercussionPreset | "custom" {
  for (const preset of PERCUSSION_PRESETS) {
    const values = PERCUSSION_PRESET_VALUES[preset];
    const matches = (Object.keys(values) as Array<keyof typeof values>).every(
      (key) => settings[key] === values[key],
    );
    if (matches) return preset;
  }
  return "custom";
}

export function defaultPercussionSettings(): PercussionSettings {
  return { enabled: false, ...PERCUSSION_PRESET_VALUES.kick };
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
  /** Percussion post-fusion stage; disabled by default. */
  percussion: PercussionSettings;
  /**
   * When true the rendered result is played once (one-shot) instead of looped.
   * Default false so existing Spectral instruments keep looping.
   */
  oneShot: boolean;
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
    percussion: defaultPercussionSettings(),
    oneShot: false,
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
  (
    a: AudioClip,
    b: AudioClip | null,
    settings: SpectralSettings,
  ): Promise<AudioClip>;
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
