import { homedir } from "node:os";
import path from "node:path";
import { readTextSafe, writeBytesSafe } from "./files";

/** How the app chooses the project to open at startup. */
export type DefaultOpen =
  { mode: "last" } | { mode: "off" } | { mode: "file"; path: string };

export interface LanternConfig {
  /** Absolute path of the most recently opened/saved project. */
  lastProject?: string | null;
  /** Startup file policy. Missing means "last". */
  defaultOpen?: DefaultOpen;
}

/**
 * Directory holding Lantern's user state (config + autosave backup).
 *
 * Resolution: `LANTERN_CONFIG` (a file path; its directory is used) →
 * `$XDG_CONFIG_HOME/lantern` → `~/.config/lantern`.
 */
export function configDir(env: NodeJS.ProcessEnv = process.env): string {
  if (env.LANTERN_CONFIG) return path.dirname(path.resolve(env.LANTERN_CONFIG));
  const xdg = env.XDG_CONFIG_HOME?.trim();
  const base = xdg ? xdg : path.join(homedir(), ".config");
  return path.join(base, "lantern");
}

/** Absolute path of the JSON config file. */
export function configPath(env: NodeJS.ProcessEnv = process.env): string {
  if (env.LANTERN_CONFIG) return path.resolve(env.LANTERN_CONFIG);
  return path.join(configDir(env), "config.json");
}

/** Validates a parsed config object, ignoring unknown/malformed fields. */
function sanitizeConfig(value: unknown): LanternConfig {
  if (!value || typeof value !== "object") return {};
  const obj = value as Record<string, unknown>;
  const config: LanternConfig = {};
  if (typeof obj.lastProject === "string") config.lastProject = obj.lastProject;
  else if (obj.lastProject === null) config.lastProject = null;

  const open = obj.defaultOpen;
  if (open && typeof open === "object") {
    const entry = open as Record<string, unknown>;
    if (entry.mode === "last") config.defaultOpen = { mode: "last" };
    else if (entry.mode === "off") config.defaultOpen = { mode: "off" };
    else if (entry.mode === "file" && typeof entry.path === "string") {
      config.defaultOpen = { mode: "file", path: entry.path };
    }
  }
  return config;
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
  await writeConfig({ lastProject: path.resolve(filePath) }, env);
}
