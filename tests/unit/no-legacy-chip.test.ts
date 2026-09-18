import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { projectPath } from "./fixtures";

/** Recursively collects every file under `dir` matching `extensions`. */
function walk(dir: string, extensions: string[]): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...walk(full, extensions));
    } else if (extensions.some((ext) => full.endsWith(ext))) {
      out.push(full);
    }
  }
  return out;
}

describe("legacy chip vocabulary removal", () => {
  it("has no legacy-chip vocabulary left in the source or tests", () => {
    // Built from fragments so this guard never matches its own source.
    const legacyName = "game" + "boy";
    const forbidden = new RegExp(
      `game\\s*boy|${legacyName}|chipId|insType|wavetable|GAME_BOY|soundLength|envelopeDirection`,
      "i",
    );
    const files = [
      ...walk(projectPath("src"), [".ts", ".tsx"]),
      ...walk(projectPath("tests"), [".ts", ".tsx"]),
    ].filter((file) => !file.endsWith("no-legacy-chip.test.ts"));
    const offenders = files.filter((file) => {
      const text = readFileSync(file, "utf8");
      return forbidden.test(text);
    });
    expect(offenders).toEqual([]);
  });
});
