// Variable-row layout maths (Cycles Mode).
//
// A pattern carries its own `rowLength`, so an order's duration is the longest
// pattern any channel plays there. Timelines, schedulers and the cursor all
// need to translate between (order, row) and an absolute row index. Kept free
// of model runtime imports (types only) so every core module can share it.

import type { Pattern } from "./songTypes";
import type { Channel, SongModel } from "./songModel";
import { lcmOf, MAX_LOOP_ORDERS, MAX_LOOP_ROWS } from "./orderLoop";

/** A pattern's row count, falling back to the song's default pattern length. */
export function patternRowLength(
  pattern: Pattern | undefined,
  fallback: number,
): number {
  const length = pattern ? Math.floor(pattern.rowLength) : NaN;
  return Number.isFinite(length) && length > 0
    ? length
    : Math.max(Math.floor(fallback), 1);
}

/** The pattern a channel plays at a (possibly wrapped) global order. */
export function channelPatternAt(
  channel: Channel,
  order: number,
): number | undefined {
  const length = channel.orderLength || channel.orderList.length;
  if (length <= 0) return undefined;
  return channel.orderList[order % length];
}

/** LCM of the per-channel order lengths — the song's order-level loop. */
export function songLoopOrders(song: SongModel): number {
  return lcmOf(
    song.channels.map(
      (channel) => channel.orderLength || channel.orderList.length,
    ),
    Math.max(song.meta.orderLength, 1),
    MAX_LOOP_ORDERS,
  );
}

/** Rows in one global order: the longest pattern any channel plays there. */
export function orderRowLength(song: SongModel, order: number): number {
  const fallback = Math.max(song.meta.patternLength, 1);
  let max = 1;
  for (const channel of song.channels) {
    const patternIndex = channelPatternAt(channel, order);
    if (patternIndex === undefined) continue;
    max = Math.max(
      max,
      patternRowLength(channel.patterns.get(patternIndex), fallback),
    );
  }
  return max;
}

/** Absolute row index at which an order begins (sum of earlier order rows). */
export function orderStartRow(song: SongModel, order: number): number {
  const orders = songLoopOrders(song);
  let total = 0;
  for (let index = 0; index < order && index < orders; index++) {
    total += orderRowLength(song, index);
  }
  return total;
}

/** Total rows in one full song loop (variable order durations). */
export function totalSongRows(song: SongModel): number {
  const orders = songLoopOrders(song);
  let total = 0;
  for (let order = 0; order < orders; order++) {
    total += orderRowLength(song, order);
    if (total >= MAX_LOOP_ROWS) return MAX_LOOP_ROWS;
  }
  return Math.max(total, 1);
}

/** Maps an absolute row index back to its (order, row) position. */
export function rowToOrder(
  song: SongModel,
  absoluteRow: number,
): { order: number; row: number } {
  const orders = songLoopOrders(song);
  const total = totalSongRows(song);
  let remaining = (((absoluteRow % total) + total) % total) | 0;
  for (let order = 0; order < orders; order++) {
    const rows = orderRowLength(song, order);
    if (remaining < rows) return { order, row: remaining };
    remaining -= rows;
  }
  return { order: Math.max(orders - 1, 0), row: 0 };
}

// ---- true polymeter (independent per-channel row clocks) -------------------

/** One row of a channel's own cycle. */
export interface ChannelStep {
  order: number;
  row: number;
  patternIndex: number;
}

/** Total rows in one channel cycle (sum of its patterns' row lengths). */
export function channelCycleRows(channel: Channel, fallback: number): number {
  let total = 0;
  for (const index of channel.orderList) {
    total += patternRowLength(channel.patterns.get(index), fallback);
  }
  return Math.max(total, 1);
}

/** Flattens a channel's order list into one entry per cycle row. */
export function channelSteps(
  channel: Channel,
  fallback: number,
): ChannelStep[] {
  const steps: ChannelStep[] = [];
  channel.orderList.forEach((patternIndex, order) => {
    const length = patternRowLength(
      channel.patterns.get(patternIndex),
      fallback,
    );
    for (let row = 0; row < length; row++) {
      steps.push({ order, row, patternIndex });
    }
  });
  return steps;
}

/** Rows before `order` in one channel's own cycle. */
export function channelOrderStartRow(
  channel: Channel,
  order: number,
  fallback: number,
): number {
  let total = 0;
  const length = channel.orderLength || channel.orderList.length;
  for (let index = 0; index < order && index < length; index++) {
    total += patternRowLength(
      channel.patterns.get(channel.orderList[index]!),
      fallback,
    );
  }
  return total;
}

/**
 * Global row clock for true polymeter: the LCM of every channel's cycle rows.
 * Channels wrap independently, so they only realign here.
 */
export function songLoopRows(song: SongModel): number {
  const fallback = Math.max(song.meta.patternLength, 1);
  if (song.channels.length === 0) return fallback;
  return lcmOf(
    song.channels.map((channel) => channelCycleRows(channel, fallback)),
    fallback,
    MAX_LOOP_ROWS,
  );
}

/**
 * A channel's row index within its own cycle at a global row, honouring the
 * per-channel phase offset and speed (Cycles phasing). Speed < 1 is half-time,
 * > 1 is double-time. Returns an integer in `0..cycleRows-1`.
 */
export function channelPositionAt(
  channel: Channel,
  globalRow: number,
  cycleRows: number,
): number {
  const speed =
    Number.isFinite(channel.speed) && channel.speed > 0 ? channel.speed : 1;
  const offset = Number.isFinite(channel.phaseOffsetRows)
    ? channel.phaseOffsetRows
    : 0;
  const cycle = Math.max(Math.floor(cycleRows), 1);
  const position = Math.floor(globalRow * speed + offset);
  return ((position % cycle) + cycle) % cycle;
}

/** A channel's own (order, row) at a global polymeter row. */
export function channelStepAtGlobal(
  song: SongModel,
  channel: number,
  globalRow: number,
): ChannelStep | null {
  const ch = song.channels[channel];
  if (!ch) return null;
  const steps = channelSteps(ch, Math.max(song.meta.patternLength, 1));
  if (steps.length === 0) return null;
  return steps[channelPositionAt(ch, globalRow, steps.length)]!;
}
