import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { projectFromJson } from "@/core/project";
import { buildSongModelFromProject, type SongModel } from "@/core/songModel";

const projectRoot = new URL("../../", import.meta.url);

export function projectPath(rel: string): string {
  return fileURLToPath(new URL(rel, projectRoot));
}

export function fixtureBytes(rel: string): Uint8Array {
  return new Uint8Array(readFileSync(projectPath(rel)));
}

export function fixtureText(rel: string): string {
  return readFileSync(projectPath(rel), "utf8");
}

/**
 * The stable test song, built the same way the app loads a project at runtime
 * (from the project snapshot, with no external module parser).
 *
 * Deliberately **not** `assets/lmp-default-proj.sptproj`: the bundled demo is
 * a moving target that product work edits, which previously turned every asset
 * change into a unit-test failure (BUG-50). Tests that need a real, populated
 * SongModel should use this; tests that must assert the shipped asset parses
 * can read `assets/lmp-default-proj.sptproj` explicitly.
 */
export function fixtureSong(): SongModel {
  return buildSongModelFromProject(
    projectFromJson(fixtureText("tests/fixtures/test-song.sptproj")),
  );
}
