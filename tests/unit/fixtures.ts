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
 * The bundled song, built the same way the app loads it at runtime (from the
 * project snapshot, with no external module parser). Tests that just need a
 * real, populated SongModel should use this.
 */
export function fixtureSong(): SongModel {
  return buildSongModelFromProject(
    projectFromJson(fixtureText("assets/lmp-default-proj.lampjson")),
  );
}
