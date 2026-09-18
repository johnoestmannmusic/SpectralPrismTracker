import type { NoteValue, Pattern, PatternCell } from "./songTypes";
import { emptyPatternCell } from "./songTypes";
import { buildRowTiming, DEFAULT_BPM } from "./timing";
import { loopOrderCount } from "./orderLoop";
import { channelPatternAt, patternRowLength } from "./layout";

export interface SongMeta {
  name: string;
  author: string;
  tuningA4: number;
  /** Beats per minute — drives row duration (60 / (bpm * highlightA)). */
  bpm: number;
  patternLength: number;
  orderLength: number;
  /** Rows per beat (used for highlighting and row duration). */
  highlightA: number;
  /** Rows per bar (highlighting only). */
  highlightB: number;
  comment: string;
}

export interface InstrumentInfo {
  name: string;
  colorRgb: [number, number, number];
}

export interface Channel {
  index: number;
  effectColumns: number;
  /**
   * This channel's own loop length. Kept in sync with `orderList.length`;
   * Channels loop independently (Cycles Mode), so lengths may differ.
   */
  orderLength: number;
  /** Rows to shift this channel's cycle start (Cycles phasing). */
  phaseOffsetRows: number;
  /** Row-advance multiplier: 0.5 = half-time, 2 = double-time. */
  speed: number;
  /** Slow tape-drift detune depth in cents (per channel). */
  detuneDriftCents: number;
  /** Tape-drift LFO rate in Hz. */
  detuneDriftRate: number;
  orderList: number[];
  /** Keyed by pattern index (not guaranteed dense). */
  patterns: Map<number, Pattern>;
  /** insTimeline[order][row] -> instrument index, held across sustains. */
  insTimeline: (number | null)[][];
  /** noteTimeline[order][row] -> held note, held across sustains. */
  noteTimeline: (NoteValue | null)[][];
}

export interface SongModel {
  meta: SongMeta;
  channels: Channel[];
  instruments: InstrumentInfo[];
  rowTimes: number[];
  rowTicks: number[];
}

export interface PatternEdit {
  channel: number;
  order: number;
  row: number;
  cell: PatternCell;
}

export interface ChannelPatternSnapshot {
  /**
   * Per-channel loop length. Kept in sync with `orderList.length` — the order
   * list is the source of truth, and this mirror is serialized for clarity.
   */
  orderLength: number;
  orderList: number[];
  patterns: PatternTuple[];
  /** Per-channel phase offset and speed (Cycles Mode). */
  phaseOffsetRows?: number;
  speed?: number;
  /** Per-channel tape-drift detune. */
  detuneDriftCents?: number;
  detuneDriftRate?: number;
}

/**
 * `[patternIndex, rows, rowLength?, name?]`. The optional tail keeps legacy
 * two-element snapshots valid while carrying the per-pattern row count and
 * display name added in Cycles Mode.
 */
export type PatternTuple = [
  index: number,
  rows: PatternCell[],
  rowLength?: number,
  name?: string,
];

export interface PatternSnapshot {
  orderLength: number;
  channels: ChannelPatternSnapshot[];
}

export function cloneNote(note: NoteValue): NoteValue {
  return { ...note };
}

export function cloneCell(cell: PatternCell): PatternCell {
  return {
    note: cell.note ? cloneNote(cell.note) : null,
    instrument: cell.instrument,
    volume: cell.volume,
    effects: cell.effects.map((e) => ({ effect: e.effect, value: e.value })),
  };
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const ss = s / 100;
  const ll = l / 100;
  const c = (1 - Math.abs(2 * ll - 1)) * ss;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = ll - c / 2;
  let r: number;
  let g: number;
  let b: number;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return [
    Math.round((r + m) * 255),
    Math.round((g + m) * 255),
    Math.round((b + m) * 255),
  ];
}

/** A channel's own loop length, falling back to its order list length. */
function channelOrderLength(channel: Channel): number {
  return channel.orderLength || channel.orderList.length;
}

/** The pattern a channel plays at a (possibly wrapped) global order. */
function patternIndexAt(channel: Channel, order: number): number | undefined {
  return channelPatternAt(channel, order);
}

function buildInstrumentTimeline(
  ch: Channel,
  patternFallback: number,
  orderCount: number,
): (number | null)[][] {
  let current: number | null = null;
  const rows: (number | null)[][] = [];
  for (let order = 0; order < orderCount; order++) {
    const pIdx = channelPatternAt(ch, order);
    const pat = pIdx === undefined ? undefined : ch.patterns.get(pIdx);
    const length = patternRowLength(pat, patternFallback);
    const row: (number | null)[] = [];
    for (let r = 0; r < length; r++) {
      const cell = pat?.rows[r];
      if (cell && cell.instrument !== null) {
        // The tracker keeps the channel's instrument across note-offs; only a
        // new instrument value changes it. (Clearing it on OFF made notes after
        // an OFF play with no instrument, i.e. silently.)
        current = cell.instrument;
      }
      row.push(current);
    }
    rows.push(row);
  }
  return rows;
}

function buildNoteTimeline(
  ch: Channel,
  patternFallback: number,
  orderCount: number,
): (NoteValue | null)[][] {
  let current: NoteValue | null = null;
  const rows: (NoteValue | null)[][] = [];
  for (let order = 0; order < orderCount; order++) {
    const pIdx = channelPatternAt(ch, order);
    const pat = pIdx === undefined ? undefined : ch.patterns.get(pIdx);
    const length = patternRowLength(pat, patternFallback);
    const row: (NoteValue | null)[] = [];
    for (let r = 0; r < length; r++) {
      const cell = pat?.rows[r];
      if (cell && cell.note) {
        current = cell.note.kind === "off" ? null : cell.note;
      }
      row.push(current);
    }
    rows.push(row);
  }
  return rows;
}

export function instrumentColor(index: number): [number, number, number] {
  return hslToRgb((index * 137.508) % 360, 65, 55);
}

/** Minimal project shape needed to reconstruct a song. */
export interface ProjectSongSource {
  songTitle?: string;
  artist?: string;
  comments?: string;
  bpmOverride?: number | null;
  highlightAOverride?: number | null;
  highlightBOverride?: number | null;
  instruments: unknown[];
  patternSnapshot?: PatternSnapshot | null;
}

/**
 * Builds a playable `SongModel` purely from a project — the only song source
 * now that there is no external module format. Pattern length defaults to 64
 * rows.
 */
export function buildSongModelFromProject(
  project: ProjectSongSource,
): SongModel {
  const snapshot = project.patternSnapshot ?? null;
  const patternLength = 64;
  const channelCount = Math.max(snapshot?.channels.length ?? 4, 1);

  const channels: Channel[] = [];
  for (let ch = 0; ch < channelCount; ch++) {
    const snap = snapshot?.channels[ch];
    const patterns = new Map<number, Pattern>();
    let effectColumns = 1;
    if (snap) {
      for (const [index, rows, storedLength, storedName] of snap.patterns) {
        const rowLength =
          storedLength && storedLength > 0
            ? Math.floor(storedLength)
            : patternLength;
        // Project snapshots store only populated rows; pad back to the
        // pattern's own row count so every row index is addressable.
        const dense = rows.map(cloneCell);
        while (dense.length < rowLength) {
          dense.push(cloneCell(emptyPatternCell()));
        }
        if (dense.length > rowLength) dense.length = rowLength;
        patterns.set(index, {
          subsong: 0,
          channel: ch,
          index,
          name: storedName ?? "",
          rowLength,
          rows: dense,
        });
        for (const cell of dense) {
          for (let e = 0; e < cell.effects.length; e++) {
            const slot = cell.effects[e]!;
            if (slot.effect !== null || slot.value !== null)
              effectColumns = Math.max(effectColumns, e + 1);
          }
        }
      }
    }
    const orderList = (snap?.orderList ?? [0]).slice();
    const channel: Channel = {
      index: ch,
      effectColumns,
      orderLength: orderList.length,
      phaseOffsetRows:
        typeof snap?.phaseOffsetRows === "number" ? snap.phaseOffsetRows : 0,
      speed: typeof snap?.speed === "number" ? snap.speed : 1,
      detuneDriftCents:
        typeof snap?.detuneDriftCents === "number" ? snap.detuneDriftCents : 0,
      detuneDriftRate:
        typeof snap?.detuneDriftRate === "number" ? snap.detuneDriftRate : 0.2,
      orderList,
      patterns,
      insTimeline: [],
      noteTimeline: [],
    };
    channels.push(channel);
  }

  const orderCount = loopOrderCount(
    channels.map((channel) => channelOrderLength(channel)),
    1,
  );
  for (const channel of channels) {
    channel.insTimeline = buildInstrumentTimeline(
      channel,
      patternLength,
      orderCount,
    );
    channel.noteTimeline = buildNoteTimeline(
      channel,
      patternLength,
      orderCount,
    );
  }

  const instrumentCount = Math.max(project.instruments.length, 1);
  const instruments: InstrumentInfo[] = Array.from(
    { length: instrumentCount },
    (_, i) => ({
      name: `Instrument ${(i + 1).toString().padStart(2, "0")}`,
      colorRgb: instrumentColor(i),
    }),
  );

  const song: SongModel = {
    meta: {
      name: project.songTitle || "Untitled",
      author: project.artist || "",
      tuningA4: 440,
      bpm: project.bpmOverride ?? DEFAULT_BPM,
      patternLength,
      orderLength: Math.max(
        1,
        snapshot?.orderLength ?? 1,
        ...channels.map((channel) => channel.orderLength),
      ),
      highlightA: project.highlightAOverride ?? 4,
      highlightB: project.highlightBOverride ?? 16,
      comment: project.comments || "",
    },
    channels,
    instruments,
    rowTimes: [],
    rowTicks: [],
  };
  const timing = buildRowTiming(song);
  song.rowTimes = timing.starts;
  song.rowTicks = timing.ticks;
  return song;
}

/**
 * Recomputes every channel's cached `orderLength` from its order list and the
 * snapshot's global `orderLength` as the maximum of those lengths. The global
 * value drives the cursor/UI span; per-channel values drive independent
 * cycling (FEAT-117).
 */
export function syncPatternSnapshotLengths(snapshot: PatternSnapshot): void {
  let max = 1;
  for (const channel of snapshot.channels) {
    channel.orderLength = channel.orderList.length;
    max = Math.max(max, channel.orderLength);
  }
  snapshot.orderLength = max;
}

export function patternSnapshot(song: SongModel): PatternSnapshot {
  return {
    orderLength: Math.max(
      1,
      ...song.channels.map((channel) => channel.orderList.length),
    ),
    channels: song.channels.map((channel) => {
      const patterns: PatternTuple[] = Array.from(channel.patterns.entries())
        .map(([index, pattern]): PatternTuple => [
          index,
          pattern.rows.map(cloneCell),
          patternRowLength(pattern, song.meta.patternLength),
          pattern.name || undefined,
        ])
        .sort((a, b) => a[0] - b[0]);
      return {
        orderLength: channel.orderList.length,
        orderList: channel.orderList.slice(),
        patterns,
        phaseOffsetRows: channel.phaseOffsetRows,
        speed: channel.speed,
        detuneDriftCents: channel.detuneDriftCents,
        detuneDriftRate: channel.detuneDriftRate,
      };
    }),
  };
}

export function applySnapshot(
  song: SongModel,
  snapshot: PatternSnapshot,
): void {
  const patternLength = song.meta.patternLength;
  for (
    let i = 0;
    i < song.channels.length && i < snapshot.channels.length;
    i++
  ) {
    const channel = song.channels[i]!;
    const snap = snapshot.channels[i]!;
    channel.orderList = snap.orderList.slice();
    channel.orderLength = channel.orderList.length;
    channel.phaseOffsetRows =
      typeof snap.phaseOffsetRows === "number" ? snap.phaseOffsetRows : 0;
    channel.speed = typeof snap.speed === "number" ? snap.speed : 1;
    channel.detuneDriftCents =
      typeof snap.detuneDriftCents === "number" ? snap.detuneDriftCents : 0;
    channel.detuneDriftRate =
      typeof snap.detuneDriftRate === "number" ? snap.detuneDriftRate : 0.2;
    channel.patterns = new Map();
    for (const [index, rows, storedLength, storedName] of snap.patterns) {
      const rowLength =
        storedLength && storedLength > 0
          ? Math.floor(storedLength)
          : patternLength;
      const dense = rows.map(cloneCell);
      while (dense.length < rowLength) dense.push(emptyPatternCell());
      if (dense.length > rowLength) dense.length = rowLength;
      channel.patterns.set(index, {
        subsong: 0,
        channel: channel.index,
        index,
        name: storedName ?? "",
        rowLength,
        rows: dense,
      });
    }
  }
  song.meta.orderLength = Math.max(
    1,
    snapshot.orderLength,
    ...song.channels.map((channel) => channel.orderLength),
  );
  const orderCount = loopOrderCount(
    song.channels.map((channel) => channelOrderLength(channel)),
    Math.max(song.meta.orderLength, 1),
  );
  for (const channel of song.channels) {
    channel.insTimeline = buildInstrumentTimeline(
      channel,
      patternLength,
      orderCount,
    );
    channel.noteTimeline = buildNoteTimeline(
      channel,
      patternLength,
      orderCount,
    );
  }
  retime(song);
}

export function retime(song: SongModel): void {
  const timing = buildRowTiming(song);
  song.rowTimes = timing.starts;
  song.rowTicks = timing.ticks;
}

export function cellAt(
  song: SongModel,
  channel: number,
  order: number,
  row: number,
): PatternCell {
  const ch = song.channels[channel];
  if (!ch) return emptyPatternCell();
  const patternIndex = patternIndexAt(ch, order);
  if (patternIndex === undefined) return emptyPatternCell();
  const pattern = ch.patterns.get(patternIndex);
  if (!pattern) return emptyPatternCell();
  const cell = pattern.rows[row];
  if (!cell) return emptyPatternCell();
  return cloneCell(cell);
}

export function applyEdit(song: SongModel, edit: PatternEdit): void {
  const patternLength = song.meta.patternLength;
  const channel = song.channels[edit.channel];
  if (!channel) return;
  const patternIndex = patternIndexAt(channel, edit.order);
  if (patternIndex === undefined) return;

  let pattern = channel.patterns.get(patternIndex);
  if (!pattern) {
    pattern = {
      subsong: 0,
      channel: edit.channel,
      index: patternIndex,
      name: "",
      rowLength: patternLength,
      rows: Array.from({ length: patternLength }, () => emptyPatternCell()),
    };
    channel.patterns.set(patternIndex, pattern);
  }
  while (pattern.rows.length <= edit.row) pattern.rows.push(emptyPatternCell());
  pattern.rows[edit.row] = cloneCell(edit.cell);

  const orderCount = loopOrderCount(
    song.channels.map((c) => channelOrderLength(c)),
    Math.max(song.meta.orderLength, 1),
  );
  channel.insTimeline = buildInstrumentTimeline(
    channel,
    patternLength,
    orderCount,
  );
  channel.noteTimeline = buildNoteTimeline(channel, patternLength, orderCount);
  retime(song);
}
