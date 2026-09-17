import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AudioFileChoice } from "../shared/types";

export interface SaveFilter {
  name: string;
  extensions: string[];
}

/** Extension -> dialog/save filter. Shared by the CLI and the (legacy) Electron shell. */
export const SAVE_FILTERS: Record<string, SaveFilter> = {
  lampjson: { name: "Lantern Project", extensions: ["lampjson"] },
  wav: { name: "WAV audio", extensions: ["wav"] },
  mid: { name: "MIDI", extensions: ["mid"] },
  zip: { name: "ZIP archive", extensions: ["zip"] },
  png: { name: "PNG image", extensions: ["png"] },
};

export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

/** `song.lampjson` -> `song`. */
export function basenameNoExt(filePath: string): string {
  return path.basename(filePath).replace(/\.[^.]+$/, "");
}

/** `song.lampjson` -> `lampjson` (lower-case, no dot). Returns "" when there is none. */
export function extensionOf(filePath: string): string {
  return path.extname(filePath).replace(".", "").toLowerCase();
}

/** Appends `extension` (e.g. "wav") when `name` has no extension. */
export function ensureExtension(name: string, extension: string): string {
  const clean = extension.replace(/^\./, "");
  return path.extname(name) ? name : `${name}.${clean}`;
}

export function saveFilterFor(filePath: string): SaveFilter | undefined {
  return SAVE_FILTERS[extensionOf(filePath)];
}

export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function readBytesSafe(
  filePath: string,
): Promise<Result<Uint8Array>> {
  try {
    const buffer = await readFile(filePath);
    return {
      ok: true,
      value: new Uint8Array(
        buffer.buffer,
        buffer.byteOffset,
        buffer.byteLength,
      ),
    };
  } catch (error) {
    return { ok: false, error: `Cannot read ${filePath}: ${String(error)}` };
  }
}

export async function readTextSafe(filePath: string): Promise<Result<string>> {
  try {
    return { ok: true, value: await readFile(filePath, "utf8") };
  } catch (error) {
    return { ok: false, error: `Cannot read ${filePath}: ${String(error)}` };
  }
}

export interface WriteOptions {
  /** Overwrite an existing file. Defaults to true. */
  overwrite?: boolean;
  /** Create missing parent directories. Defaults to true. */
  createDirs?: boolean;
}

export async function writeBytesSafe(
  filePath: string,
  bytes: Uint8Array,
  options: WriteOptions = {},
): Promise<Result<string>> {
  const { overwrite = true, createDirs = true } = options;
  const target = path.resolve(filePath);
  try {
    if (!overwrite && (await fileExists(target))) {
      return { ok: false, error: `Refusing to overwrite ${target}` };
    }
    if (createDirs) await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, bytes);
    return { ok: true, value: target };
  } catch (error) {
    return { ok: false, error: `Cannot write ${target}: ${String(error)}` };
  }
}

/** Reads an audio file by path into the shape the renderer/backend expects. */
export async function readAudioChoice(
  filePath: string,
): Promise<AudioFileChoice | { error: string }> {
  const result = await readBytesSafe(filePath);
  if (!result.ok) return { error: result.error };
  return { name: basenameNoExt(filePath), bytes: result.value };
}
