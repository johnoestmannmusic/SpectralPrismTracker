import { homedir } from "node:os";
import path from "node:path";
import { readTextSafe, writeBytesSafe } from "./files";
import { sanitizeConfig } from "../configSanitize";
import type { HostConfig, LanternConfig } from "../types";

export type { DefaultOpen, LanternConfig } from "../types";
export { sanitizeConfig };

/**
 * Directory holding Lantern's user state (config + autosave backup).
 *
 * Resolution: `LANTERN_CONFIG` (a file path; its directory is used) →
 * `$XDG_CONFIG_HOME/lantern` → `~/.config/lantern` (or `%APPDATA%\lantern` on
 * Windows when XDG is unset).
 */
export function configDir(env: NodeJS.ProcessEnv = process.env): string {
  if (env.LANTERN_CONFIG) return path.dirname(path.resolve(env.LANTERN_CONFIG));
  const xdg = env.XDG_CONFIG_HOME?.trim();
  if (xdg) return path.join(xdg, "lantern");
  if (process.platform === "win32") {
    const appData =
      env.APPDATA?.trim() || path.join(homedir(), "AppData", "Roaming");
    return path.join(appData, "lantern");
  }
  return path.join(homedir(), ".config", "lantern");
}

/** Absolute path of the JSON config file. */
export function configPath(env: NodeJS.ProcessEnv = process.env): string {
  if (env.LANTERN_CONFIG) return path.resolve(env.LANTERN_CONFIG);
  return path.join(configDir(env), "config.json");
}

/** Reads the config, returning `{}` when missing or malformed. */
export async function readConfig(
  env: NodeJS.ProcessEnv = process.env,
): Promise<LanternConfig> {
  const result = await readTextSafe(configPath(env));
  if (!result.ok) return {};
  try {
    return sanitizeConfig(JSON.parse(result.value));
  } catch {
    return {};
  }
}

/** Merges `patch` into the on-disk config and writes it atomically. */
export async function writeConfig(
  patch: LanternConfig,
  env: NodeJS.ProcessEnv = process.env,
): Promise<boolean> {
  const current = await readConfig(env);
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

/** Path of the rolling autosave backup (`<config dir>/backup.lmpjson`). */
export function backupPath(env: NodeJS.ProcessEnv = process.env): string {
  return path.join(configDir(env), "backup.lmpjson");
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
