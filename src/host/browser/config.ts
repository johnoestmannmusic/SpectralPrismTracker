import type { HostConfig, LanternConfig } from "../types";
import { sanitizeConfig } from "../configSanitize";

/**
 * Browser config store (recent projects, startup policy).
 *
 * Backed by IndexedDB with a localStorage fallback. The autosave backup itself
 * is written through the file host (OPFS) at the virtual path below.
 */

const DB_NAME = "lantern";
const STORE = "keyval";
const CONFIG_KEY = "config";
const BACKUP_PATH = "/backup.lmpjson";

function idbAvailable(): boolean {
  return typeof indexedDB !== "undefined";
}

function openDb(): Promise<IDBDatabase | null> {
  if (!idbAvailable()) return Promise.resolve(null);
  return new Promise((resolve) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
  });
}

async function idbGet<T>(key: string): Promise<T | null> {
  const db = await openDb();
  if (!db) return null;
  return new Promise((resolve) => {
    const tx = db.transaction(STORE, "readonly");
    const request = tx.objectStore(STORE).get(key);
    request.onsuccess = () =>
      resolve((request.result as T | undefined) ?? null);
    request.onerror = () => resolve(null);
  });
}

async function idbSet(key: string, value: unknown): Promise<void> {
  const db = await openDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}

async function storeGet(): Promise<LanternConfig> {
  const fromIdb = await idbGet<unknown>(CONFIG_KEY);
  if (fromIdb !== null) return sanitizeConfig(fromIdb);
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    return raw ? sanitizeConfig(JSON.parse(raw)) : {};
  } catch {
    return {};
  }
}

async function storeSet(config: LanternConfig): Promise<void> {
  if (idbAvailable()) {
    await idbSet(CONFIG_KEY, config);
    return;
  }
  try {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
  } catch {
    /* storage unavailable — ignore, config stays session-only */
  }
}

/** Browser implementation of the config host contract. */
export const browserConfig: HostConfig = {
  read: () => storeGet(),
  write: async (patch) => {
    const current = await storeGet();
    await storeSet({ ...current, ...patch });
    return true;
  },
  recordLastProject: async (filePath) => {
    const current = await storeGet();
    const recent = [
      filePath,
      ...(current.recentProjects ?? []).filter((entry) => entry !== filePath),
    ].slice(0, 10);
    await storeSet({ lastProject: filePath, recentProjects: recent });
  },
  backupPath: () => BACKUP_PATH,
};
