import { describe, expect, it } from "vitest";
import { Scheduler, type Sequence } from "@/core/sampler";

/** Six rows of 0.5s each; rowTimes has a trailing loop-end entry. */
function sequence(): Sequence {
  return {
    tuning: 440,
    rows: [[], [], [], [], [], []],
    rowTimes: [0, 0.5, 1, 1.5, 2, 2.5, 3],
  };
}

describe("Scheduler order loop (FEAT-95)", () => {
  it("wraps within the loop range instead of the whole song", () => {
    const seq = sequence();
    // Loop rows 2..3 (song time 1.0s..2.0s). Start at the loop start.
    const scheduler = new Scheduler(seq, 0, 1.0, { startRow: 2, endRow: 4 });
    const first = scheduler.tick(0, 0.6);
    expect(first.map((row) => row.row)).toEqual([2, 3]);
    // After the loop end, it should return to row 2 (not row 0 or the end).
    const second = scheduler.tick(1.0, 0.6);
    expect(second.map((row) => row.row)).toEqual([2, 3]);
    for (const row of second) expect(row.when).toBeGreaterThanOrEqual(1.0);
  });

  it("plays the whole song when no loop range is given", () => {
    const seq = sequence();
    const scheduler = new Scheduler(seq, 0, 0);
    const rows = scheduler.tick(0, 1.6);
    expect(rows.map((row) => row.row)).toEqual([0, 1, 2, 3]);
  });

  it("rejects a loop range outside the sequence", () => {
    const seq = sequence();
    const scheduler = new Scheduler(seq, 0, 0, { startRow: -1, endRow: 4 });
    // Invalid range falls back to whole-song playback.
    const rows = scheduler.tick(0, 1.1);
    expect(rows.map((row) => row.row)).toEqual([0, 1, 2]);
  });
});
