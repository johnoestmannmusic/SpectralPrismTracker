import type { NoteValue } from "./songTypes";
import { samplerPlaybackRate } from "./pitch";
import type { SongModel } from "./songModel";
import { defaultSpectralSettings, type SpectralSettings } from "./spectral";
import { rowDuration } from "./timing";
import { channelPositionAt, channelSteps, songLoopRows } from "./layout";

export const LOOKAHEAD_SEC = 0.15;
export const POLL_INTERVAL_MS = 25;

// ---- Chord instrument mode --------------------------------------------------

/** Named chord shapes. `custom` uses the editable interval list. */
export type ChordPreset =
  | "major"
  | "minor"
  | "sus2"
  | "sus4"
  | "major7"
  | "minor7"
  | "dom7"
  | "add9"
  | "power"
  | "open"
  | "custom";

export const CHORD_PRESETS: ChordPreset[] = [
  "major",
  "minor",
  "sus2",
  "sus4",
  "major7",
  "minor7",
  "dom7",
  "add9",
  "power",
  "open",
  "custom",
];

/** Root-relative semitone intervals for each built-in shape. */
export const CHORD_PRESET_INTERVALS: Record<ChordPreset, number[]> = {
  major: [0, 4, 7],
  minor: [0, 3, 7],
  sus2: [0, 2, 7],
  sus4: [0, 5, 7],
  major7: [0, 4, 7, 11],
  minor7: [0, 3, 7, 10],
  dom7: [0, 4, 7, 10],
  add9: [0, 4, 7, 14],
  power: [0, 7],
  open: [0, 7, 12, 19],
  custom: [0, 4, 7],
};

/**
 * Per-instrument Chord voice settings. A pattern note is the chord root; each
 * interval becomes one voice (TypeScript schedules the voices — see
 * `chordVoices`).
 */
export interface ChordSettings {
  enabled: boolean;
  preset: ChordPreset;
  /** Custom root-relative intervals (used when `preset` is `custom`). */
  intervals: number[];
  /** Chord inversions: move the lowest/highest tone by octaves (-2..2). */
  inversion: number;
  /** Extra octave copies of the whole chord (1..3). */
  octaves: number;
  /** Per-voice detune in cents (0..50). */
  detuneCents: number;
  /** Strum/roll: seconds between successive voices (0..0.2). */
  strumSec: number;
  /** Voice stereo spread around the instrument pan (0..1). */
  panSpread: number;
  /** Max simultaneous voices in one chord (1..16). */
  voiceCap: number;
}

export function defaultChordSettings(): ChordSettings {
  return {
    enabled: false,
    preset: "major",
    intervals: [0, 4, 7],
    inversion: 0,
    octaves: 1,
    detuneCents: 0,
    strumSec: 0,
    panSpread: 0.3,
    voiceCap: 12,
  };
}

/** The root-relative interval list a chord plays, after inversion/octaves. */
export function chordIntervals(settings: ChordSettings): number[] {
  const base =
    settings.preset === "custom"
      ? settings.intervals
      : (CHORD_PRESET_INTERVALS[settings.preset] ??
        CHORD_PRESET_INTERVALS.major);
  const set = (base.length > 0 ? base : [0]).slice();
  const inversion = Math.max(-2, Math.min(2, Math.round(settings.inversion)));
  for (let i = 0; i < inversion; i++) {
    set.sort((a, b) => a - b);
    set[0]! += 12;
  }
  for (let i = 0; i > inversion; i--) {
    set.sort((a, b) => a - b);
    set[set.length - 1]! -= 12;
  }
  const octaves = Math.max(1, Math.min(3, Math.round(settings.octaves)));
  const out: number[] = [];
  for (let octave = 0; octave < octaves; octave++) {
    for (const interval of set) out.push(interval + 12 * octave);
  }
  out.sort((a, b) => a - b);
  return out.slice(0, Math.max(1, Math.min(16, Math.round(settings.voiceCap))));
}

/**
 * One scheduled chord voice: playback-rate ratio against the root note, gain
 * multiplier, pan offset in -1..1, and strum delay in seconds.
 */
export interface ChordVoice {
  rateRatio: number;
  gain: number;
  pan: number;
  delaySec: number;
}

/** Expands a root playback rate into the instrument's chord voices. */
export function chordVoices(settings: ChordSettings): ChordVoice[] {
  const intervals = chordIntervals(settings);
  const count = Math.max(intervals.length, 1);
  const panSpread = Math.max(0, Math.min(1, settings.panSpread));
  const detune = Math.max(0, Math.min(50, settings.detuneCents));
  const strum = Math.max(0, Math.min(0.2, settings.strumSec));
  return intervals.map((interval, index) => ({
    rateRatio: Math.pow(
      2,
      (interval +
        (detune === 0 ? 0 : ((index % 2 === 0 ? 1 : -1) * detune) / 100)) /
        12,
    ),
    // Normalise by voice count so a dense chord cannot clip the channel
    // (the voices share a source and can sum constructively at the onset).
    gain: 1 / count,
    pan: count <= 1 ? 0 : panSpread * ((index / (count - 1)) * 2 - 1),
    delaySec: strum * index,
  }));
}

export interface SamplerSettings {
  sourceIndex: number | null;
  startSec: number;
  endSec: number;
  transpose: number;
  volume: number;
  /** Serialised in Project JSON as `loop`. */
  looping: boolean;
  pingPong: boolean;
  attack: number;
  decay: number;
  sustain: number;
  release: number;
  /** Stereo pan centre, -1 (left) .. 1 (right). */
  pan: number;
  /** Random pan width around the centre, 0..1. */
  panRandomRange: number;
  /** Vibrato LFO speed in Hz. */
  vibratoSpeed: number;
  /** Vibrato depth in semitones (0 = off). */
  vibratoDepth: number;
  polyphonic: boolean;
  voiceCap: number;
  /**
   * When true (default) a new note or note-off on the channel hard-cuts the
   * previous voice immediately, skipping its release tail.
   */
  choke: boolean;
  spectral: SpectralSettings;
  /** Chord instrument mode (root note in the pattern). */
  chord: ChordSettings;
  /** Not persisted (matches the Rust `#[serde(skip)]`). */
  muted: boolean;
}

export function defaultSamplerSettings(): SamplerSettings {
  return {
    sourceIndex: null,
    startSec: 0,
    endSec: 0,
    transpose: 0,
    volume: 1,
    looping: false,
    pingPong: false,
    attack: 0.005,
    decay: 0.08,
    sustain: 0.7,
    release: 0.15,
    pan: 0,
    panRandomRange: 0,
    vibratoSpeed: 6,
    vibratoDepth: 0,
    polyphonic: false,
    voiceCap: 8,
    choke: true,
    spectral: defaultSpectralSettings(),
    chord: defaultChordSettings(),
    muted: false,
  };
}

/**
 * Glitch-Ambient defaults used for instruments created while Cycles Mode is on:
 * sustained ping-pong loops with a long release and a wide stereo spread — the
 * raw material for Oval-style phasing. Safe to use with no source assigned.
 */
export function glitchSamplerDefaults(): SamplerSettings {
  const settings = defaultSamplerSettings();
  settings.looping = true;
  settings.pingPong = true;
  settings.release = 0.6;
  settings.panRandomRange = 0.35;
  settings.polyphonic = true;
  settings.voiceCap = 8;
  return settings;
}

export function setSpectralEnabled(
  settings: SamplerSettings,
  enabled: boolean,
): void {
  if (enabled === settings.spectral.enabled) return;
  if (enabled) {
    settings.spectral.savedStartSec = settings.startSec;
    settings.spectral.savedEndSec = settings.endSec;
    settings.spectral.savedLooping = settings.looping;
    // Spectral renders are sustained loops by default.
    settings.looping = true;
  } else {
    settings.startSec = settings.spectral.savedStartSec;
    settings.endSec = settings.spectral.savedEndSec;
    settings.looping = settings.spectral.savedLooping;
  }
  settings.spectral.enabled = enabled;
}

export interface EnvelopeShape {
  attack: number;
  decay: number;
  sustain: number;
}

/**
 * Effective amplitude envelope applied to a voice. One-shot Spectral voices
 * (e.g. percussion) already carry their own baked amplitude envelope, so the
 * instrument ADSR is bypassed — otherwise a long instrument attack can outlast
 * a short hit and render it inaudible.
 */
export function envelopeShape(settings: SamplerSettings): EnvelopeShape {
  if (settings.spectral.enabled && settings.spectral.oneShot) {
    return { attack: 0.003, decay: 0, sustain: 1 };
  }
  return {
    attack: Math.min(Math.max(settings.attack, 0.003), 5),
    decay: Math.min(Math.max(settings.decay, 0), 5),
    sustain: clamp01(settings.sustain),
  };
}

export function envelopeAt(settings: SamplerSettings, time: number): number {
  const { attack, decay, sustain } = envelopeShape(settings);
  if (time <= 0) return 0;
  if (time < attack) return time / attack;
  if (time < attack + decay)
    return 1 + (sustain - 1) * ((time - attack) / decay);
  return sustain;
}

function clamp01(v: number): number {
  return Math.min(Math.max(v, 0), 1);
}

export function samplePosition(
  settings: SamplerSettings,
  elapsed: number,
  rate: number,
): number {
  const length = settings.endSec - settings.startSec;
  if (length <= 0) return settings.startSec;
  const traveled = Math.max(elapsed, 0) * rate;
  let position: number;
  if (settings.looping && settings.pingPong) {
    const phase = ((traveled % (2 * length)) + 2 * length) % (2 * length);
    position = phase <= length ? phase : 2 * length - phase;
  } else if (settings.looping) {
    position = ((traveled % length) + length) % length;
  } else {
    position = Math.min(traveled, length);
  }
  return settings.startSec + position;
}

/** Returns [start, length] for a valid slice of decoded audio, else null. */
export function region(
  settings: SamplerSettings,
  duration: number,
): [number, number] | null {
  if (
    !Number.isFinite(duration) ||
    duration <= 0 ||
    !Number.isFinite(settings.startSec) ||
    !Number.isFinite(settings.endSec)
  ) {
    return null;
  }
  const start = Math.min(Math.max(settings.startSec, 0), duration);
  const end = Math.min(Math.max(settings.endSec, 0), duration);
  return end > start ? [start, end - start] : null;
}

export type SamplerEvent =
  | {
      type: "note";
      channel: number;
      instrument: number;
      rate: number;
      volume: number;
      /** Shared id for the voices of one chord (lets OFF release them together). */
      voiceGroup?: number;
      /** Stereo pan offset added to the instrument pan (-1..1). */
      panOffset?: number;
      /**
       * Deterministic random pan spread for this note (-1..1), baked at
       * sequence-build time so live playback and WAV export place every voice
       * identically (the live engine used to call Math.random() per voice).
       */
      panRandom?: number;
      /** Strum/roll delay in seconds before this voice starts. */
      delaySec?: number;
      /** Start position within the trimmed region, 0..1. */
      offsetFraction?: number;
      /** Play the trimmed region backwards. */
      reverse?: boolean;
      /** Slow tape-drift detune in cents (from the channel). */
      detuneCents?: number;
      /** 14xx hold/freeze: loop the note until the next note or OFF. */
      hold?: boolean;
    }
  | { type: "off"; channel: number }
  | { type: "pitchRamp"; channel: number; rate: number; duration: number };

export interface Sequence {
  tuning: number;
  rows: SamplerEvent[][];
  /** Absolute row starts followed by the loop end. */
  rowTimes: number[];
}

export function sequenceDuration(sequence: Sequence): number {
  return sequence.rowTimes[sequence.rowTimes.length - 1] ?? 0;
}

/** Deterministic 0..1 roll per (row, channel) for the `10xx` probability FX. */
export function rowRoll(globalRow: number, channel: number): number {
  let x =
    (Math.imul(globalRow, 2654435761) + Math.imul(channel + 1, 40503)) >>> 0;
  x = (x ^ (x << 13)) >>> 0;
  x = (x ^ (x >>> 17)) >>> 0;
  x = (x ^ (x << 5)) >>> 0;
  return x / 4294967296;
}

/**
 * Deterministic 0..1 pan roll per (row, channel, voice) used for an
 * instrument's `panRandomRange` spread. Both the live sampler and the offline
 * export read the baked value from the event, so the stereo image is stable
 * across playbacks and identical in the exported WAV.
 */
export function rowPanRoll(
  globalRow: number,
  channel: number,
  voice: number,
): number {
  let x =
    Math.imul(globalRow, 2654435761) +
    Math.imul(channel + 1, 40503) +
    Math.imul(voice + 1, 2246822519);
  x = (x ^ (x >>> 15)) >>> 0;
  x = Math.imul(x, 2246822519) >>> 0;
  x = (x ^ (x >>> 13)) >>> 0;
  return x / 4294967296;
}

export function sequenceFromSong(
  song: SongModel,
  settings?: Array<SamplerSettings | undefined>,
): Sequence {
  const rows: SamplerEvent[][] = [];
  const baseRates: (number | null)[] = [null, null, null, null];
  const pitchOffsets = [0, 0, 0, 0];
  const slides = [0, 0, 0, 0];

  const fallback = Math.max(song.meta.patternLength, 1);
  const total = songLoopRows(song);
  const channelCount = Math.min(song.channels.length, 4);
  const stepsByChannel = song.channels
    .slice(0, channelCount)
    .map((channel) => channelSteps(channel, fallback));

  for (let globalRow = 0; globalRow < total; globalRow++) {
    const events: SamplerEvent[] = [];
    for (let channel = 0; channel < channelCount; channel++) {
      const ch = song.channels[channel]!;
      const steps = stepsByChannel[channel]!;
      if (steps.length === 0) continue;
      // True polymeter: each channel wraps its own cycle independently.
      const step = steps[channelPositionAt(ch, globalRow, steps.length)]!;
      const pattern = ch.patterns.get(step.patternIndex);
      const cell = pattern?.rows[step.row];
      if (!cell) continue;

      const note: NoteValue | null = cell.note;
      // Parse this cell's effect columns once: 01/02 pitch slides plus the
      // glitch-event FX (probability / ratchet / reverse / sample offset).
      let probability = 1;
      let ratchet = 1;
      let reverse = false;
      let offsetFraction = 0;
      let hold = false;
      const effectCount = Math.min(ch.effectColumns, cell.effects.length);
      for (let e = 0; e < effectCount; e++) {
        const effect = cell.effects[e]!;
        const value = effect.value;
        if (value === null) continue;
        if (effect.effect === 0x01) slides[channel] = value / 32;
        else if (effect.effect === 0x02) slides[channel] = -value / 32;
        else if (effect.effect === 0x10)
          probability = Math.min(Math.max(value, 0), 255) / 255;
        else if (effect.effect === 0x11)
          ratchet = Math.min(Math.max(Math.round(value), 1), 16);
        else if (effect.effect === 0x12) reverse = value !== 0;
        else if (effect.effect === 0x13)
          offsetFraction = Math.min(Math.max(value, 0), 255) / 255;
        else if (effect.effect === 0x14) hold = value !== 0;
      }

      if (note) {
        if (note.kind === "off" || note.kind === "release") {
          events.push({ type: "off", channel });
          baseRates[channel] = null;
        } else if (note.kind === "note" || note.kind === "rawFreq") {
          const instrument = ch.insTimeline[step.order]?.[step.row] ?? null;
          const rate = samplerPlaybackRate(note, song.meta.tuningA4, 0);
          // Deterministic trigger chance so playback and WAV export agree.
          const plays =
            probability >= 1 || rowRoll(globalRow, channel) < probability;
          if (
            plays &&
            instrument !== null &&
            rate !== null &&
            instrument < song.instruments.length &&
            Number.isFinite(rate) &&
            rate > 0
          ) {
            const level = Math.min(cell.volume ?? 15, 15) / 15;
            const chord = settings?.[instrument]?.chord;
            // Per-channel tape drift: a slow sine offset in cents.
            const drift = ch.detuneDriftCents;
            const detuneCents =
              drift === 0
                ? 0
                : drift *
                  Math.sin(
                    2 *
                      Math.PI *
                      (ch.detuneDriftRate > 0 ? ch.detuneDriftRate : 0.2) *
                      (song.rowTimes[globalRow] ?? 0) +
                      (channel + 1) * 1.7,
                  );
            // Deterministic pan spread, baked per voice so playback and export
            // place the note in exactly the same stereo position.
            const panWidth = Math.min(
              Math.max(settings?.[instrument]?.panRandomRange ?? 0, 0),
              1,
            );
            const randomPan = (voice: number): number =>
              (rowPanRoll(globalRow, channel, voice) * 2 - 1) * panWidth;
            const base: Extract<SamplerEvent, { type: "note" }>[] = [];
            if (chord?.enabled) {
              // Expand the root note into its chord voices, sharing one group so
              // a note-off releases the whole chord together.
              const group = (globalRow % 65536) * 4 + channel;
              chordVoices(chord).forEach((voice, voiceIndex) => {
                base.push({
                  type: "note",
                  channel,
                  instrument,
                  rate: rate * voice.rateRatio,
                  volume: level * voice.gain,
                  voiceGroup: group,
                  panOffset: voice.pan,
                  panRandom: randomPan(voiceIndex),
                  delaySec: voice.delaySec,
                  offsetFraction,
                  reverse,
                  detuneCents,
                  hold,
                });
              });
            } else {
              base.push({
                type: "note",
                channel,
                instrument,
                rate,
                volume: level,
                panRandom: randomPan(0),
                offsetFraction,
                reverse,
                detuneCents,
                hold,
              });
            }
            // Ratchet: repeat the row's note(s) evenly across the row duration.
            if (ratchet > 1) {
              const rowDur = rowDuration(song, globalRow);
              for (let hit = 0; hit < ratchet; hit++) {
                for (const event of base) {
                  events.push({
                    ...event,
                    delaySec: (event.delaySec ?? 0) + (hit * rowDur) / ratchet,
                  });
                }
              }
            } else {
              for (const event of base) events.push(event);
            }
            baseRates[channel] = rate;
            pitchOffsets[channel] = 0;
          }
        }
      }

      if (slides[channel] !== 0) {
        const baseRate = baseRates[channel];
        if (baseRate !== null) {
          const ticks = song.rowTicks[globalRow] ?? 6;
          pitchOffsets[channel] =
            (pitchOffsets[channel] ?? 0) + (slides[channel] ?? 0) * ticks;
          events.push({
            type: "pitchRamp",
            channel,
            rate: baseRate * Math.pow(2, (pitchOffsets[channel] ?? 0) / 12),
            duration: rowDuration(song, globalRow),
          });
        }
      }
    }
    rows.push(events);
  }

  return { tuning: song.meta.tuningA4, rows, rowTimes: song.rowTimes.slice() };
}

export interface ScheduledRow {
  row: number;
  when: number;
}

export interface LoopRange {
  /** Absolute row index (order * patternLength + row) to loop from. */
  startRow: number;
  /** Absolute row index to loop to (exclusive). */
  endRow: number;
}

export class Scheduler {
  private readonly rowTimes: number[];
  private readonly duration: number;
  private nextRow: number;
  private readonly startClock: number;
  private readonly offset: number;
  private readonly loop: LoopRange | null;
  private readonly loopRows: number;
  private readonly loopStartTime: number;
  private readonly loopDuration: number;

  constructor(
    sequence: Sequence,
    startClock: number,
    offset: number,
    loop?: LoopRange | null,
  ) {
    const duration = sequenceDuration(sequence);
    if (!(
      Number.isFinite(duration) &&
      duration > 0 &&
      sequence.rows.length > 0
    )) {
      throw new Error(
        "Scheduler requires a positive-duration, non-empty sequence",
      );
    }
    const rowCount = sequence.rows.length;
    const clampedOffset = Math.max(offset, 0);
    this.rowTimes = sequence.rowTimes.slice();
    this.duration = duration;
    this.startClock = startClock;
    this.offset = clampedOffset;

    const validLoop =
      loop &&
      loop.startRow >= 0 &&
      loop.endRow > loop.startRow &&
      loop.endRow <= rowCount
        ? loop
        : null;
    this.loop = validLoop ? { ...validLoop } : null;

    if (this.loop) {
      const { startRow, endRow } = this.loop;
      this.loopRows = endRow - startRow;
      this.loopStartTime = this.rowTimes[startRow] ?? 0;
      const loopEndTime = this.rowTimes[endRow] ?? duration;
      this.loopDuration = Math.max(loopEndTime - this.loopStartTime, 1e-9);
      const within =
        clampedOffset <= this.loopStartTime
          ? 0
          : (((clampedOffset - this.loopStartTime) % this.loopDuration) +
              this.loopDuration) %
            this.loopDuration;
      const local = Math.max(
        partitionPoint(
          this.rowTimes.slice(startRow, endRow),
          (time) => time - this.loopStartTime <= within,
        ) - 1,
        0,
      );
      this.nextRow = local;
    } else {
      this.loopRows = 0;
      this.loopStartTime = 0;
      this.loopDuration = duration;
      const cycle = Math.floor(clampedOffset / duration);
      const within = ((clampedOffset % duration) + duration) % duration;
      const row = Math.max(
        partitionPoint(
          this.rowTimes.slice(0, rowCount),
          (time) => time <= within,
        ) - 1,
        0,
      );
      this.nextRow = cycle * rowCount + row;
    }
  }

  tick(now: number, lookahead: number): ScheduledRow[] {
    const result: ScheduledRow[] = [];
    if (this.loop) {
      const horizon =
        this.offset + now - this.startClock + Math.max(lookahead, 0);
      const startRow = this.loop.startRow;
      for (;;) {
        const local = this.nextRow % this.loopRows;
        const cycle = Math.floor(this.nextRow / this.loopRows);
        const row = startRow + local;
        const time = (this.rowTimes[row] ?? 0) + cycle * this.loopDuration;
        if (time > horizon) break;
        result.push({
          row,
          when: Math.max(
            Math.max(this.startClock + time - this.offset, now),
            this.startClock,
          ),
        });
        this.nextRow += 1;
      }
      return result;
    }
    const songTime = this.offset + now - this.startClock;
    const rowCount = this.rowTimes.length - 1;
    const locate = (time: number): number => {
      const cycle = Math.max(Math.floor(time / this.duration), 0);
      const within = ((time % this.duration) + this.duration) % this.duration;
      const row = Math.max(
        partitionPoint(
          this.rowTimes.slice(0, rowCount),
          (start) => start <= within,
        ) - 1,
        0,
      );
      return cycle * rowCount + row;
    };
    this.nextRow = Math.max(
      this.nextRow,
      locate(Math.max(songTime, this.offset)),
    );
    const horizon = songTime + Math.max(lookahead, 0);
    for (;;) {
      const cycle = Math.floor(this.nextRow / rowCount);
      const row = this.nextRow % rowCount;
      const time = cycle * this.duration + (this.rowTimes[row] ?? 0);
      if (time > horizon) break;
      result.push({
        row,
        when: Math.max(
          Math.max(this.startClock + time - this.offset, now),
          this.startClock,
        ),
      });
      this.nextRow += 1;
    }
    return result;
  }
}

function partitionPoint<T>(
  items: ArrayLike<T>,
  predicate: (item: T) => boolean,
): number {
  let lo = 0;
  let hi = items.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (predicate(items[mid] as T)) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** One channel of an isolated loop, with 5 ms edge fades and optional reverse half. */
export function loopChannel(
  data: Float32Array,
  sampleRate: number,
  start: number,
  end: number,
  pingPong: boolean,
): Float32Array {
  const first = Math.min(
    Math.floor(Math.max(start, 0) * sampleRate),
    data.length,
  );
  const last = Math.min(Math.ceil(Math.max(end, 0) * sampleRate), data.length);
  if (first >= last) return new Float32Array(0);
  const src = data.subarray(first, last);
  const len = src.length;
  const fade = Math.min(Math.round(0.005 * sampleRate), Math.floor(len / 2));
  const regionOut = new Float32Array(len);
  regionOut.set(src);
  for (let i = 0; i < fade; i++) {
    const gain = i / fade;
    regionOut[i] = regionOut[i]! * gain;
    regionOut[len - 1 - i] = regionOut[len - 1 - i]! * gain;
  }
  if (!pingPong) return regionOut;
  const out = new Float32Array(len * 2);
  out.set(regionOut, 0);
  for (let i = 0; i < len; i++) out[len + i] = regionOut[len - 1 - i]!;
  return out;
}

/** Min/max pairs for waveform display. */
export function waveform(
  data: Float32Array,
  bins: number,
): Array<[number, number]> {
  if (data.length === 0 || bins === 0) return [];
  const chunkSize = Math.ceil(data.length / bins);
  const out: Array<[number, number]> = [];
  for (let start = 0; start < data.length; start += chunkSize) {
    const end = Math.min(start + chunkSize, data.length);
    let low = 0;
    let high = 0;
    for (let i = start; i < end; i++) {
      const v = data[i]!;
      if (v < low) low = v;
      if (v > high) high = v;
    }
    out.push([low, high]);
  }
  return out;
}
