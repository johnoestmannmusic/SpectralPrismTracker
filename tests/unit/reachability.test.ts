import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * HC002: every menu and parameter must be reachable within two button presses.
 * This reads the human-facing map in docs/REACHABILITY.md and enforces that it
 * covers every overlay and never exceeds the two-press budget.
 */
const DOC = readFileSync(
  new URL("../../docs/REACHABILITY.md", import.meta.url),
  "utf8",
);

interface Row {
  target: string;
  path: string;
  presses: number;
}

const ROWS: Row[] = [
  ...DOC.matchAll(/^\|\s*`([^`]+)`\s*\|\s*([^|]+)\|\s*(\d+)\s*\|$/gm),
].map((match) => ({
  target: match[1]!,
  path: match[2]!.trim(),
  presses: Number(match[3]),
}));

/** Must match the OverlayName union in src/tui/commands/types.ts. */
const OVERLAYS = [
  "mixer",
  "samples",
  "instruments",
  "patterns",
  "stepthrough",
  "sampler",
  "spectral",
  "percussion",
  "fx",
] as const;

describe("HC002 two-press reachability", () => {
  it("documents a path for every overlay", () => {
    const targets = new Set(ROWS.map((row) => row.target));
    for (const overlay of OVERLAYS) {
      expect(targets.has(`overlay:${overlay}`)).toBe(true);
    }
  });

  it("maps a meaningful number of menus and parameter groups", () => {
    expect(ROWS.length).toBeGreaterThanOrEqual(15);
  });

  it("keeps every documented path within two presses", () => {
    for (const row of ROWS) {
      expect(row.presses, `${row.target} (${row.path})`).toBeLessThanOrEqual(2);
      expect(row.presses).toBeGreaterThanOrEqual(1);
    }
  });

  it("describes every path with a concrete key or command", () => {
    for (const row of ROWS) {
      expect(row.path.length).toBeGreaterThan(1);
    }
  });
});
