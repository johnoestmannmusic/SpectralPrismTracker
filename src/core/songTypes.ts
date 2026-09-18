// Core song-model vocabulary shared across the tracker: note/cell values,
// patterns, instrument metadata and song info. Kept free of any file-format
// concerns so the model can be built from project snapshots or other sources.

/** Semitone index from C-(-5) (0) up to B-9 (179), plus the non-note markers. */
export type NoteValue =
  | { kind: "note"; note: number }
  | { kind: "off" }
  | { kind: "release" }
  | { kind: "macroRelease" }
  | { kind: "rawFreq"; value: number };

export interface EffectSlot {
  effect: number | null;
  value: number | null;
}

export interface PatternCell {
  note: NoteValue | null;
  instrument: number | null;
  volume: number | null;
  /** Up to 8 effect columns, in tracker order. */
  effects: EffectSlot[];
}

export interface Pattern {
  subsong: number;
  channel: number;
  index: number;
  name: string;
  /** Number of rows this pattern plays (per-pattern order length). */
  rowLength: number;
  rows: PatternCell[];
}

export function emptyEffectSlot(): EffectSlot {
  return { effect: null, value: null };
}

export function emptyPatternCell(columnCount = 8): PatternCell {
  return {
    note: null,
    instrument: null,
    volume: null,
    effects: Array.from({ length: columnCount }, emptyEffectSlot),
  };
}
