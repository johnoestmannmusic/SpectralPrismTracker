import { describe, expect, it } from "vitest";
import { buildSongModel, cellAt, type SongModel } from "@/core/songModel";
import { parseFurFile } from "@/core/fur/node";
import {
  adjustCell,
  adjustNote,
  clearPatternsSnapshot,
  clearValue,
  flatColumnsForChannel,
  insertPatternAfter,
  interpolateColumn,
  readValue,
  removePatternAt,
  selectionRect,
  writeValue,
} from "@/core/tracker";
import { patternSnapshot } from "@/core/songModel";
import { fixtureBytes } from "./fixtures";

function fixture(): SongModel {
  return buildSongModel(parseFurFile(fixtureBytes("assets/flight_school_night_shift.fur")));
}

function emptyCell() {
  return {
    note: null,
    instrument: null,
    volume: null,
    effects: Array.from({ length: 8 }, () => ({ effect: null, value: null })),
  };
}

describe("tracker helpers", () => {
  it("orders flat columns NOTE/INS/VOL then FX", () => {
    const song = fixture();
    expect(flatColumnsForChannel(song, 0).map((c) => c.kind)).toEqual([
      "note",
      "ins",
      "vol",
      "fx",
    ]);
  });

  it("round-trips cell values and ignores mismatched writes", () => {
    const cell = emptyCell();
    const withNote = writeValue(cell, { kind: "note" }, { kind: "note", value: { kind: "note", note: 60 } });
    expect(readValue(withNote, { kind: "note" })).toEqual({
      kind: "note",
      value: { kind: "note", note: 60 },
    });
    // Writing a volume value into a NOTE column is a no-op.
    const unchanged = writeValue(cell, { kind: "note" }, { kind: "vol", value: 5 });
    expect(unchanged.note).toBeNull();
  });

  it("clamps note and volume adjustments", () => {
    const cell = writeValue(emptyCell(), { kind: "note" }, { kind: "note", value: { kind: "note", note: 179 } });
    expect(adjustNote(cell, 12).note).toEqual({ kind: "note", note: 179 });
    const vol = writeValue(emptyCell(), { kind: "vol" }, { kind: "vol", value: 15 });
    expect(adjustCell(vol, { kind: "vol" }, 1, 10).volume).toBe(15);
  });

  it("normalizes selection rectangles", () => {
    const song = fixture();
    const rect = selectionRect(
      song,
      { channel: 0, order: 0, row: 4, column: { kind: "vol" } },
      { channel: 0, order: 0, row: 1, column: { kind: "note" } },
    );
    expect(rect).toEqual({ order: 0, channel: 0, rowLo: 1, rowHi: 4, colLo: 0, colHi: 2 });
  });

  it("interpolates a note range and keeps the FX effect code", () => {
    const song = fixture();
    // Set endpoints for a volume interpolation.
    const setVol = (row: number, value: number) => {
      const cell = writeValue(emptyCell(), { kind: "vol" }, { kind: "vol", value });
      const pattern = song.channels[0]!.patterns.get(song.channels[0]!.orderList[0]!)!;
      pattern.rows[row] = cell;
    };
    setVol(0, 0);
    setVol(4, 8);
    const changed = interpolateColumn(song, 0, { kind: "vol" }, 0, 0, 4);
    expect(changed).toBe(true);
    expect(cellAt(song, 0, 0, 2).volume).toBe(4);
  });

  it("inserts, removes and clears patterns in a snapshot", () => {
    const song = fixture();
    const snap = patternSnapshot(song);
    const before = snap.orderLength;
    insertPatternAfter(snap, 0, song.meta.patternLength, true);
    expect(snap.orderLength).toBe(before + 1);
    removePatternAt(snap, 0);
    expect(snap.orderLength).toBe(before);
    clearPatternsSnapshot(snap, song.meta.patternLength);
    expect(snap.orderLength).toBe(1);
    expect(snap.channels.every((c) => c.orderList.length === 1)).toBe(true);
  });
});

describe("clearValue", () => {
  it("clears a single sub-column", () => {
    const cell = writeValue(emptyCell(), { kind: "vol" }, { kind: "vol", value: 7 });
    expect(clearValue(cell, { kind: "vol" }).volume).toBeNull();
  });
});
