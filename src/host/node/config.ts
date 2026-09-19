import { homedir } from "node:os";
import path from "node:path";
import { readTextSafe, writeBytesSafe } from "./files";
import { sanitizeConfig } from "../configSanitize";
import type { HostConfig, LanternConfig } from "../types";

export type { DefaultOpen, LanternConfig } from "../types";
export { sanitizeConfig };

/** Canonical app slug (FEAT-151). Legacy `lantern` dirs are migrated on read. */
export const APP_SLUG = "spectralprism";
const LEGACY_APP_SLUG = "lantern";

/** New preferred env var, falling back to the legacy `LANTERN_` name. */
function configEnvPath(env: NodeJS.ProcessEnv): string | undefined {
  return env.SPT_CONFIG ?? env.LANTERN_CONFIG;
}

function legacyConfigDir(env: NodeJS.ProcessEnv): string {
  const xdg = env.XDG_CONFIG_HOME?.trim();
  if (xdg) return path.join(xdg, LEGACY_APP_SLUG);
  if (process.platform === "win32") {
    const appData =
      env.APPDATA?.trim() || path.join(homedir(), "AppData", "Roaming");
    return path.join(appData, LEGACY_APP_SLUG);
  }
  return path.join(homedir(), ".config", LEGACY_APP_SLUG);
}

/**
 * Directory holding SpectralPrism Tracker's user state (config + autosave).
 *
 * Resolution: `SPT_CONFIG` (or legacy `LANTERN_CONFIG`; a file path, its parent
 * is used) → `$XDG_CONFIG_HOME/spectralprism` → `~/.config/spectralprism` (or
 * `%APPDATA%\spectralprism` on Windows when XDG is unset).
 */
export function configDir(env: NodeJS.ProcessEnv = process.env): string {
  const explicit = configEnvPath(env);
  if (explicit) return path.dirname(path.resolve(explicit));
  const xdg = env.XDG_CONFIG_HOME?.trim();
  if (xdg) return path.join(xdg, APP_SLUG);
  if (process.platform === "win32") {
    const appData =
      env.APPDATA?.trim() || path.join(homedir(), "AppData", "Roaming");
    return path.join(appData, APP_SLUG);
  }
  return path.join(homedir(), ".config", APP_SLUG);
}

/** Absolute path of the JSON config file. */
export function configPath(env: NodeJS.ProcessEnv = process.env): string {
  const explicit = configEnvPath(env);
  if (explicit) return path.resolve(explicit);
  return path.join(configDir(env), "config.json");
}

/** Path of the old `~/.config/lantern/config.json`, for one-time migration. */
export function legacyConfigPath(env: NodeJS.ProcessEnv = process.env): string {
  return path.join(legacyConfigDir(env), "config.json");
}

/**
 * Pure read of the canonical config file. Never migrates and never writes, so
 * it is safe to call from {@link writeConfig} (the migration below calls
 * `writeConfig`, which must not call back into `readConfig` — that recursed
 * forever on first run and OOM-crashed the app).
 */
async function readConfigFile(env: NodeJS.ProcessEnv): Promise<LanternConfig> {
  const result = await readTextSafe(configPath(env));
  if (!result.ok) return {};
  try {
    return sanitizeConfig(JSON.parse(result.value));
  } catch {
    return {};
  }
}

/**
 * Reads the config, returning `{}` when missing or malformed. On first run
 * after the rename, migrates an existing `lantern/config.json` into the new
 * location so recent projects and startup policy survive (FEAT-151).
 */
export async function readConfig(
  env: NodeJS.ProcessEnv = process.env,
): Promise<LanternConfig> {
  const result = await readTextSafe(configPath(env));
  if (result.ok) {
    try {
      return sanitizeConfig(JSON.parse(result.value));
    } catch {
      return {};
    }
  }
  // Only migrate when using the default (non-explicit) location.
  if (!configEnvPath(env)) {
    const legacy = await readTextSafe(legacyConfigPath(env));
    if (legacy.ok) {
      try {
        const parsed = sanitizeConfig(JSON.parse(legacy.value));
        await writeConfig(parsed, env);
        return parsed;
      } catch {
        /* fall through to empty config */
      }
    }
  }
  return {};
}

/** Merges `patch` into the on-disk config and writes it atomically. */
export async function writeConfig(
  patch: LanternConfig,
  env: NodeJS.ProcessEnv = process.env,
): Promise<boolean> {
  // Read the file directly: using `readConfig` here would trigger migration,
  // which itself writes — mutual recursion.
  const current = await readConfigFile(env);
  const next: LanternConfig = { ...current, ...patch };
  const json = `${JSON.stringify(next, null, 2)}\n`;
  const written = await writeBytesSafe(
    configPath(env),
    new TextEncoder().encode(json),
  );
  return written.ok;
}

/** Remembers the given project as the last one opened/saved. */
export async function recordLastProject(
  filePath: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const resolved = path.resolve(filePath);
  const current = await readConfig(env);
  const recent = [
    resolved,
    ...(current.recentProjects ?? []).filter((entry) => entry !== resolved),
  ].slice(0, 10);
  await writeConfig({ lastProject: resolved, recentProjects: recent }, env);
}

/** Path of the rolling autosave backup (`<config dir>/backup.sptproj`). */
export function backupPath(env: NodeJS.ProcessEnv = process.env): string {
  return path.join(configDir(env), "backup.sptproj");
}

/** Node implementation of the config host contract. */
export function createNodeConfig(
  env: NodeJS.ProcessEnv = process.env,
): HostConfig {
  return {
    read: () => readConfig(env),
    write: (patch) => writeConfig(patch, env),
    recordLastProject: (filePath) => recordLastProject(filePath, env),
    backupPath: () => backupPath(env),
  };
}

export const nodeConfig: HostConfig = createNodeConfig();
