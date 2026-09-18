import type { SongMeta, SongModel } from "./songModel";
import {
  channelOrderStartRow,
  channelPositionAt,
  channelStepAtGlobal,
  channelSteps,
  songLoopRows,
} from "./layout";

export { songLoopOrders } from "./layout";

/** Ticks per pattern row. Kept constant so 01/02 pitch-slide maths is stable. */
export const TICKS_PER_ROW = 6;

/** Default tempo when a project carries no BPM. */
export const DEFAULT_BPM = 150;

/** Clamp range for the running BPM (user-set and effect-adjusted). */
export const MIN_BPM = 20;
export const MAX_BPM = 999;

export function clampBpm(bpm: number): number {
  return Math.min(Math.max(bpm, MIN_BPM), MAX_BPM);
}

/** Seconds per pattern row: 60 / (bpm * rows-per-beat). */
export function rowDurationSec(meta: SongMeta): number {
  const beatRows = Math.max(meta.highlightA, 1);
  const bpm = Math.max(meta.bpm, 1);
  return 60 / (bpm * beatRows);
}

export interface RowTiming {
  starts: number[];
  ticks: number[];
}

/**
 * Build one loop's row clock from a single BPM plus the two timing effects:
 * `09 xx` raises the running BPM by xx, `0A xx` lowers it. An effect applies
 * to its own row and every row after it until the next change. This is true
 * polymeter: every channel advances one row per tick and wraps its own cycle,
 * so BPM effects are gathered from every channel's current step.
 */
export function buildRowTiming(song: SongModel): RowTiming {
  const starts: number[] = [];
  const ticks: number[] = [];
  const beatRows = Math.max(song.meta.highlightA, 1);
  const fallback = Math.max(song.meta.patternLength, 1);
  const total = songLoopRows(song);
  const stepsByChannel = song.channels.map((channel) =>
    channelSteps(channel, fallback),
  );
  let time = 0;
  let bpm = clampBpm(song.meta.bpm);

  for (let globalRow = 0; globalRow < total; globalRow++) {
    starts.push(time);
    for (let c = 0; c < song.channels.length; c++) {
      const steps = stepsByChannel[c]!;
      if (steps.length === 0) continue;
      const channel = song.channels[c]!;
      const step = steps[channelPositionAt(channel, globalRow, steps.length)]!;
      const pattern = channel.patterns.get(step.patternIndex);
      const cell = pattern?.rows[step.row];
      if (!cell) continue;
      const effectCount = channel.effectColumns;
      for (let e = 0; e < effectCount && e < cell.effects.length; e++) {
        const effect = cell.effects[e]!;
        const command = effect.effect;
        const value = effect.value;
        if (command === null || value === null) continue;
        if (command === 0x09 && value > 0) {
          bpm = clampBpm(bpm + value);
        } else if (command === 0x0a && value > 0) {
          bpm = clampBpm(bpm - value);
        }
      }
    }
    ticks.push(TICKS_PER_ROW);
    time += 60 / (bpm * beatRows);
  }
  starts.push(time);
  return { starts, ticks };
}

export interface SongPosition {
  orderPos: number;
  row: number;
}

function partitionPointRange<T>(
  items: ArrayLike<T>,
  end: number,
  predicate: (item: T) => boolean,
): number {
  let lo = 0;
  let hi = Math.min(end, items.length);
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (predicate(items[mid] as T)) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Global polymeter row at a song time (wraps the LCM loop). Clamps negatives. */
export function songGlobalRowAt(song: SongModel, t: number): number {
  const rows = Math.max(song.rowTimes.length - 1, 1);
  const duration = song.rowTimes[song.rowTimes.length - 1] ?? 0;
  let time = 0;
  if (duration > 0) {
    time = (((t < 0 ? 0 : t) % duration) + duration) % duration;
  }
  return Math.max(
    partitionPointRange(song.rowTimes, rows, (start) => start <= time) - 1,
    0,
  );
}

/** Absolute song-time (seconds) -> channel 0's (order, row). Clamps negatives. */
export function songPositionAt(song: SongModel, t: number): SongPosition {
  const step = channelStepAtGlobal(song, 0, songGlobalRowAt(song, t));
  return { orderPos: step?.order ?? 0, row: step?.row ?? 0 };
}

export function rowTime(song: SongModel, order: number, row: number): number {
  const channel0 = song.channels[0];
  const index = channel0
    ? channelOrderStartRow(
        channel0,
        order,
        Math.max(song.meta.patternLength, 1),
      ) + row
    : 0;
  return song.rowTimes[index] ?? 0;
}

export function rowDuration(song: SongModel, absoluteRow: number): number {
  const start = song.rowTimes[absoluteRow];
  const end = song.rowTimes[absoluteRow + 1];
  if (start !== undefined && end !== undefined) return end - start;
  return rowDurationSec(song.meta);
}
