import type { SongMeta, SongModel } from "./songModel";

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
 * to its own row and every row after it until the next change.
 */
export function buildRowTiming(song: SongModel): RowTiming {
  const rowCount = song.meta.orderLength * song.meta.patternLength;
  const starts: number[] = [];
  const ticks: number[] = [];
  const beatRows = Math.max(song.meta.highlightA, 1);
  let time = 0;
  let bpm = clampBpm(song.meta.bpm);

  for (let absoluteRow = 0; absoluteRow < rowCount; absoluteRow++) {
    starts.push(time);
    const order = Math.floor(absoluteRow / song.meta.patternLength);
    const row = absoluteRow % song.meta.patternLength;
    for (const channel of song.channels) {
      const patternIndex = channel.orderList[order];
      if (patternIndex === undefined) continue;
      const pattern = channel.patterns.get(patternIndex);
      const cell = pattern?.rows[row];
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

/** Absolute song-time (seconds) -> (order position, row). Clamps negatives. */
export function songPositionAt(song: SongModel, t: number): SongPosition {
  const rows = Math.max(song.rowTimes.length - 1, 1);
  const duration = song.rowTimes[song.rowTimes.length - 1] ?? 0;
  let time = 0;
  if (duration > 0) {
    time = (((t < 0 ? 0 : t) % duration) + duration) % duration;
  }
  const totalRows = Math.max(
    partitionPointRange(song.rowTimes, rows, (start) => start <= time) - 1,
    0,
  );
  const patternLength = Math.max(song.meta.patternLength, 1);
  return {
    orderPos:
      Math.floor(totalRows / patternLength) %
      Math.max(song.meta.orderLength, 1),
    row: totalRows % patternLength,
  };
}

export function rowTime(song: SongModel, order: number, row: number): number {
  const index = order * song.meta.patternLength + row;
  return song.rowTimes[index] ?? 0;
}

export function rowDuration(song: SongModel, absoluteRow: number): number {
  const start = song.rowTimes[absoluteRow];
  const end = song.rowTimes[absoluteRow + 1];
  if (start !== undefined && end !== undefined) return end - start;
  return rowDurationSec(song.meta);
}
