import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { LoadedSong } from "../shared/types";

/** Options controlling where bundled assets are found. */
export interface AssetRootOptions {
  /** Explicit assets directory (highest priority). */
  root?: string;
  /** Environment used to read `LANTERN_ASSETS`. Defaults to `process.env`. */
  env?: NodeJS.ProcessEnv;
  /** Working directory used for the `assets` candidate. Defaults to `process.cwd()`. */
  cwd?: string;
}

/** Directory of the entry script, used for install-relative asset lookup. */
function scriptDir(): string {
  const entry = process.argv[1];
  return entry ? path.dirname(path.resolve(entry)) : process.cwd();
}

/**
 * Finds the bundled `assets/` directory. Resolution order:
 *   1. explicit `root`
 *   2. `LANTERN_ASSETS`
 *   3. `<cwd>/assets`
 *   4. `<scriptDir>/assets`, then up to two parent directories
 *
 * Candidates containing the bundled project file win; otherwise the first
 * existing directory is used. Falls back to `<cwd>/assets` so the "cannot find
 * assets" error message points at a sensible location.
 */
export function resolveAssetsDir(options: AssetRootOptions = {}): string {
  if (options.root) return path.resolve(options.root);
  const env = options.env ?? process.env;
  if (env.LANTERN_ASSETS) return path.resolve(env.LANTERN_ASSETS);

  const cwd = options.cwd ?? process.cwd();
  const base = scriptDir();
  const candidates = [
    path.join(cwd, "assets"),
    path.join(base, "assets"),
    path.resolve(base, "..", "assets"),
    path.resolve(base, "..", "..", "assets"),
  ];

  const withProject = candidates.find((candidate) =>
    existsSync(path.join(candidate, "lmp-default-proj.lampjson")),
  );
  if (withProject) return withProject;

  const existing = candidates.find((candidate) => existsSync(candidate));
  return existing ?? candidates[0]!;
}

/** Reads a file, returning `null` when it does not exist. */
export async function readBytesIfPresent(
  filePath: string,
): Promise<Uint8Array | null> {
  try {
    const buffer = await readFile(filePath);
    return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  } catch (error) {
    if (isMissing(error)) return null;
    throw error;
  }
}

/** Reads a UTF-8 text file, returning `null` when it does not exist. */
export async function readTextIfPresent(
  filePath: string,
): Promise<string | null> {
  try {
    return await readFile(filePath, "utf8");
  } catch (error) {
    if (isMissing(error)) return null;
    throw error;
  }
}

/** Reads a bundled asset relative to the resolved assets directory. */
export function readAsset(
  relativePath: string,
  options?: AssetRootOptions,
): Promise<Uint8Array | null> {
  return readBytesIfPresent(path.join(resolveAssetsDir(options), relativePath));
}

/** Reads a bundled UTF-8 asset relative to the resolved assets directory. */
export function readAssetText(
  relativePath: string,
  options?: AssetRootOptions,
): Promise<string | null> {
  return readTextIfPresent(path.join(resolveAssetsDir(options), relativePath));
}

export interface SourceSampleAsset {
  index: number;
  path: string;
  present: boolean;
  bytes: Uint8Array | null;
}

/** Lists the bundled source samples (indices 0..5) with presence flags. */
export async function listSourceSamples(
  options: AssetRootOptions = {},
): Promise<SourceSampleAsset[]> {
  const dir = resolveAssetsDir(options);
  return Promise.all(
    [0, 1, 2, 3, 4, 5].map(async (index) => {
      const filePath = path.join(dir, "SourceSamples", `${index}.ogg`);
      const bytes = await readBytesIfPresent(filePath);
      return { index, path: filePath, present: bytes !== null, bytes };
    }),
  );
}

/**
 * Loads the bundled default song from its project file plus Source Samples.
 */
export async function loadDefaultSong(
  options: AssetRootOptions = {},
): Promise<LoadedSong | { error: string }> {
  const dir = resolveAssetsDir(options);

  let project: string | null;
  try {
    project = await readTextIfPresent(
      path.join(dir, "lmp-default-proj.lampjson"),
    );
  } catch (error) {
    return {
      error: `Cannot read the bundled project assets in ${dir}: ${String(error)}`,
    };
  }
  if (!project) {
    return { error: `Cannot find the bundled project assets in ${dir}` };
  }

  const samples = await Promise.all(
    [0, 1, 2, 3, 4, 5].map((i) =>
      readBytesIfPresent(path.join(dir, "SourceSamples", `${i}.ogg`)),
    ),
  );

  return { project, samples };
}

function isMissing(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException | undefined)?.code;
  return code === "ENOENT" || code === "ENOTDIR";
}
