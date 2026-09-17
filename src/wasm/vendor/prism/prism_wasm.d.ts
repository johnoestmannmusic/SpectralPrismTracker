/* tslint:disable */
/* eslint-disable */

export function render_fused(
  a_flat: Float32Array,
  a_channels: number,
  b_flat: Float32Array,
  b_channels: number,
  sample_rate: number,
  freeze_point_a_pct: number,
  volume_a_pct: number,
  tune_a_semitones: number,
  formant_shift_a_semitones: number,
  mode: string,
  freeze_point_b_pct: number,
  formant_shift_b_semitones: number,
  volume_b_pct: number,
  tune_b_semitones: number,
  mix_amount_pct: number,
  cross_synth_amount_pct: number,
  convolve_amount_pct: number,
  ring_mod_amount_pct: number,
  stereo_width_pct: number,
  loop_length_seconds: number,
): object;

/**
 * Loop-Length modulation: structural, so it is rendered by tiling
 * phase-locked loops of different lengths into one fixed-length super-loop
 * instead of varying per hop. Same arguments as `render_fused_modulated`,
 * plus `num_segments` and the join/seam `crossfade_seconds`.
 */
export function render_fused_loop_lengths(
  a_flat: Float32Array,
  a_channels: number,
  b_flat: Float32Array,
  b_channels: number,
  sample_rate: number,
  freeze_point_a_pct: number,
  volume_a_pct: number,
  tune_a_semitones: number,
  formant_shift_a_semitones: number,
  mode: string,
  freeze_point_b_pct: number,
  formant_shift_b_semitones: number,
  volume_b_pct: number,
  tune_b_semitones: number,
  mix_amount_pct: number,
  cross_synth_amount_pct: number,
  convolve_amount_pct: number,
  ring_mod_amount_pct: number,
  stereo_width_pct: number,
  loop_length_seconds: number,
  tracks_flat: Float32Array,
  num_points: number,
  track_mask: number,
  num_segments: number,
  crossfade_seconds: number,
): object;

/**
 * Modulated sibling of `render_fused`: same parameters, plus a flat array of
 * per-control-point absolute values for every modulatable target
 * (`MOD_TARGET_COUNT * num_points`, in the shared target order) and a bitmask
 * selecting which targets actually vary. With `track_mask == 0` it produces
 * output identical to `render_fused`.
 */
export function render_fused_modulated(
  a_flat: Float32Array,
  a_channels: number,
  b_flat: Float32Array,
  b_channels: number,
  sample_rate: number,
  freeze_point_a_pct: number,
  volume_a_pct: number,
  tune_a_semitones: number,
  formant_shift_a_semitones: number,
  mode: string,
  freeze_point_b_pct: number,
  formant_shift_b_semitones: number,
  volume_b_pct: number,
  tune_b_semitones: number,
  mix_amount_pct: number,
  cross_synth_amount_pct: number,
  convolve_amount_pct: number,
  ring_mod_amount_pct: number,
  stereo_width_pct: number,
  loop_length_seconds: number,
  tracks_flat: Float32Array,
  num_points: number,
  track_mask: number,
): object;

/**
 * Percussion post-stage: takes the flat PCM produced by `render_fused` /
 * `render_fused_modulated` (the output of *any* Fusion mode) and
 * re-synthesizes it as a short one-shot percussive hit. Mirrors
 * `prism_dsp::percussion::render_percussion`.
 */
export function render_percussion(
  fused_flat: Float32Array,
  fused_channels: number,
  sample_rate: number,
  root_note: number,
  noise_amount_pct: number,
  noise_color: string,
  noise_decay_seconds: number,
  transient_amount_pct: number,
  transient_decay_seconds: number,
  transient_frequency_hz: number,
  pitch_start_semitones: number,
  pitch_end_semitones: number,
  pitch_decay_seconds: number,
  amp_decay_seconds: number,
  body_amount_pct: number,
  partial_count: number,
  partial_decay_seconds: number,
  digital_amount_pct: number,
  drive_amount_pct: number,
  compress_amount_pct: number,
  stereo_width_pct: number,
  length_seconds: number,
): object;

export type InitInput =
  RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
  readonly memory: WebAssembly.Memory;
  readonly render_fused: (
    a: number,
    b: number,
    c: number,
    d: number,
    e: number,
    f: number,
    g: number,
    h: number,
    i: number,
    j: number,
    k: number,
    l: number,
    m: number,
    n: number,
    o: number,
    p: number,
    q: number,
    r: number,
    s: number,
    t: number,
    u: number,
    v: number,
    w: number,
  ) => [number, number, number];
  readonly render_fused_loop_lengths: (
    a: number,
    b: number,
    c: number,
    d: number,
    e: number,
    f: number,
    g: number,
    h: number,
    i: number,
    j: number,
    k: number,
    l: number,
    m: number,
    n: number,
    o: number,
    p: number,
    q: number,
    r: number,
    s: number,
    t: number,
    u: number,
    v: number,
    w: number,
    x: number,
    y: number,
    z: number,
    a1: number,
    b1: number,
    c1: number,
  ) => [number, number, number];
  readonly render_fused_modulated: (
    a: number,
    b: number,
    c: number,
    d: number,
    e: number,
    f: number,
    g: number,
    h: number,
    i: number,
    j: number,
    k: number,
    l: number,
    m: number,
    n: number,
    o: number,
    p: number,
    q: number,
    r: number,
    s: number,
    t: number,
    u: number,
    v: number,
    w: number,
    x: number,
    y: number,
    z: number,
    a1: number,
  ) => [number, number, number];
  readonly render_percussion: (
    a: number,
    b: number,
    c: number,
    d: number,
    e: number,
    f: number,
    g: number,
    h: number,
    i: number,
    j: number,
    k: number,
    l: number,
    m: number,
    n: number,
    o: number,
    p: number,
    q: number,
    r: number,
    s: number,
    t: number,
    u: number,
    v: number,
    w: number,
    x: number,
  ) => [number, number, number];
  readonly __wbindgen_exn_store: (a: number) => void;
  readonly __externref_table_alloc: () => number;
  readonly __wbindgen_externrefs: WebAssembly.Table;
  readonly __wbindgen_malloc: (a: number, b: number) => number;
  readonly __wbindgen_realloc: (
    a: number,
    b: number,
    c: number,
    d: number,
  ) => number;
  readonly __externref_table_dealloc: (a: number) => void;
  readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(
  module: { module: SyncInitInput } | SyncInitInput,
): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init(
  module_or_path?:
    | { module_or_path: InitInput | Promise<InitInput> }
    | InitInput
    | Promise<InitInput>,
): Promise<InitOutput>;
