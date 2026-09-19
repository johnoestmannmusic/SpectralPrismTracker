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

/**
 * Browser file-system host.
 *
 * Uses the Origin Private File System (OPFS) when available so project /
 * backup paths behave like a real (sandboxed) filesystem, with a small
 * in-memory fallback for browsers or private modes without OPFS.
 */

// Minimal OPFS surface so we do not depend on a specific DOM lib version.
interface OpfsWritable {
  write(data: Uint8Array): Promise<void>;
  close(): Promise<void>;
}
interface OpfsFileHandle {
  kind: "file";
  name: string;
  getFile(): Promise<File>;
  createWritable(): Promise<OpfsWritable>;
}
interface OpfsDirHandle {
  kind: "directory";
  name: string;
  getDirectoryHandle(
    name: string,
    options?: { create?: boolean },
  ): Promise<OpfsDirHandle>;
  getFileHandle(
    name: string,
    options?: { create?: boolean },
  ): Promise<OpfsFileHandle>;
  removeEntry(name: string, options?: { recursive?: boolean }): Promise<void>;
  values(): AsyncIterableIterator<OpfsFileHandle | OpfsDirHandle>;
}

const memoryFiles = new Map<string, Uint8Array>();

/** Normalises `/a/./b/../c` to `/a/c` using POSIX semantics. */
export function normalizePath(filePath: string): string {
  const parts = filePath.replace(/\\/g, "/").split("/").filter(Boolean);
  const out: string[] = [];
  for (const part of parts) {
    if (part === ".") continue;
    if (part === "..") out.pop();
    else out.push(part);
  }
  return `/${out.join("/")}`;
}

async function opfsRoot(): Promise<OpfsDirHandle | null> {
  const storage = navigator.storage as unknown as {
    getDirectory?: () => Promise<OpfsDirHandle>;
  };
  if (!storage?.getDirectory) return null;
  try {
    return await storage.getDirectory();
  } catch {
    return null;
  }
}

async function resolveFile(
  root: OpfsDirHandle,
  filePath: string,
  create: boolean,
): Promise<OpfsFileHandle> {
  const parts = normalizePath(filePath).split("/").filter(Boolean);
  const name = parts.pop();
  if (!name) throw new Error(`Invalid path: ${filePath}`);
  let dir = root;
  for (const part of parts) {
    dir = await dir.getDirectoryHandle(part, { create });
  }
  return dir.getFileHandle(name, { create });
}

async function readBytes(filePath: string): Promise<Uint8Array | null> {
  const root = await opfsRoot();
  if (root) {
    try {
      const handle = await resolveFile(root, filePath, false);
      const file = await handle.getFile();
      return new Uint8Array(await file.arrayBuffer());
    } catch {
      return null;
    }
  }
  return memoryFiles.get(normalizePath(filePath)) ?? null;
}

async function writeBytes(
  filePath: string,
  bytes: Uint8Array,
): Promise<string> {
  const root = await opfsRoot();
  if (root) {
    const handle = await resolveFile(root, filePath, true);
    const writable = await handle.createWritable();
    await writable.write(bytes);
    await writable.close();
    return normalizePath(filePath);
  }
  const key = normalizePath(filePath);
  memoryFiles.set(key, bytes);
  return key;
}

export async function fileExists(filePath: string): Promise<boolean> {
  return (await readBytes(filePath)) !== null;
}

export async function readBytesSafe(
  filePath: string,
): Promise<Result<Uint8Array>> {
  const bytes = await readBytes(filePath);
  if (!bytes) return { ok: false, error: `Cannot read ${filePath}` };
  return { ok: true, value: bytes };
}

export async function readTextSafe(filePath: string): Promise<Result<string>> {
  const bytes = await readBytes(filePath);
  if (!bytes) return { ok: false, error: `Cannot read ${filePath}` };
  return { ok: true, value: new TextDecoder().decode(bytes) };
}

export async function writeBytesSafe(
  filePath: string,
  bytes: Uint8Array,
  options: WriteOptions = {},
): Promise<Result<string>> {
  const { overwrite = true } = options;
  if (!overwrite && (await fileExists(filePath))) {
    return { ok: false, error: `Refusing to overwrite ${filePath}` };
  }
  try {
    return { ok: true, value: await writeBytes(filePath, bytes) };
  } catch (error) {
    return { ok: false, error: `Cannot write ${filePath}: ${String(error)}` };
  }
}

/** Lists OPFS entries under a prefix; [] when OPFS is unavailable. */
export async function completePath(prefix: string): Promise<string[]> {
  const root = await opfsRoot();
  if (!root) return [];
  try {
    const normalized = normalizePath(prefix);
    const dirPath = prefix.endsWith("/") ? normalized : dirname(normalized);
    const base = prefix.endsWith("/") ? "" : basenameNoExt(normalized);
    let dir = root;
    for (const part of dirPath.split("/").filter(Boolean)) {
      dir = await dir.getDirectoryHandle(part, { create: false });
    }
    const out: string[] = [];
    for await (const entry of dir.values()) {
      if (!entry.name.toLowerCase().startsWith(base.toLowerCase())) continue;
      const suffix = entry.kind === "directory" ? "/" : "";
      out.push(`${normalizePath(`${dirPath}/${entry.name}`)}${suffix}`);
      if (out.length >= 50) break;
    }
    return out;
  } catch {
    return [];
  }
}

/** Lists OPFS entries under a directory (FEAT-155); [] when OPFS is absent. */
export async function listDirectory(dir: string): Promise<DirectoryEntry[]> {
  const root = await opfsRoot();
  if (!root) return [];
  try {
    const normalized = normalizePath(dir);
    let handle = root;
    for (const part of normalized.split("/").filter(Boolean)) {
      handle = await handle.getDirectoryHandle(part, { create: false });
    }
    const out: DirectoryEntry[] = [];
    for await (const entry of handle.values()) {
      out.push({
        name: entry.name,
        path: normalizePath(`${normalized}/${entry.name}`),
        isDirectory: entry.kind === "directory",
      });
    }
    out.sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    return out;
  } catch {
    return [];
  }
}

/** Browser implementation of the file-system host contract. */
export const browserFs: HostFs = {
  readTextSafe,
  readBytesSafe,
  writeBytesSafe,
  fileExists,
  resolvePath: (filePath) => normalizePath(filePath),
  completePath,
  listDirectory,
};
