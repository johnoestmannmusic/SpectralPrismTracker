import { access, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AudioFileChoice } from "@/shared/types";
import {
  basenameNoExt,
  dirname,
  ensureExtension,
  extensionOf,
  extname,
  SAVE_FILTERS,
  saveFilterFor,
  type SaveFilter,
} from "@/runtime/paths";
import type { DirectoryEntry, HostFs, Result, WriteOptions } from "../types";

// Re-export the pure helpers so `@/runtime/files` stays the single import site.
export {
  basenameNoExt,
  dirname,
  ensureExtension,
  extensionOf,
  extname,
  SAVE_FILTERS,
  saveFilterFor,
  type SaveFilter,
};

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

/** Directory/file completion for path arguments (Node only). */
export async function completePath(prefix: string): Promise<string[]> {
  const dir = prefix.endsWith("/") ? prefix : `${path.dirname(prefix)}/`;
  const base = prefix.endsWith("/") ? "" : path.basename(prefix);
  try {
    const entries = await readdir(dir.length ? dir : ".", {
      withFileTypes: true,
    });
    return entries
      .filter((entry) =>
        entry.name.toLowerCase().startsWith(base.toLowerCase()),
      )
      .map((entry) => `${dir}${entry.name}${entry.isDirectory() ? "/" : ""}`)
      .slice(0, 50);
  } catch {
    return [];
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

/** Node implementation of the file-system host contract. */
export const nodeFs: HostFs = {
  readTextSafe,
  readBytesSafe,
  writeBytesSafe,
  fileExists,
  resolvePath: (filePath) => path.resolve(filePath),
  completePath,
  listDirectory,
};

/** Lists one directory's immediate entries (FEAT-155). */
export async function listDirectory(dir: string): Promise<DirectoryEntry[]> {
  try {
    const entries = await readdir(dir.length ? dir : ".", {
      withFileTypes: true,
    });
    return entries
      .map((entry) => ({
        name: entry.name,
        path: path.join(dir, entry.name),
        isDirectory: entry.isDirectory(),
      }))
      .sort((a, b) => {
        if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
  } catch {
    return [];
  }
}
