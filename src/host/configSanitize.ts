import type { LanternConfig } from "./types";

/** Validates a parsed config object, ignoring unknown/malformed fields. */
export function sanitizeConfig(value: unknown): LanternConfig {
  if (!value || typeof value !== "object") return {};
  const obj = value as Record<string, unknown>;
  const config: LanternConfig = {};
  if (typeof obj.lastProject === "string") config.lastProject = obj.lastProject;
  else if (obj.lastProject === null) config.lastProject = null;

  if (Array.isArray(obj.recentProjects)) {
    config.recentProjects = obj.recentProjects
      .filter((entry): entry is string => typeof entry === "string")
      .slice(0, 10);
  }

  const open = obj.defaultOpen;
  if (open && typeof open === "object") {
    const entry = open as Record<string, unknown>;
    if (entry.mode === "last") config.defaultOpen = { mode: "last" };
    else if (entry.mode === "off") config.defaultOpen = { mode: "off" };
    else if (entry.mode === "file" && typeof entry.path === "string") {
      config.defaultOpen = { mode: "file", path: entry.path };
    }
  }
  if (typeof obj.cyclesMode === "boolean") config.cyclesMode = obj.cyclesMode;
  return config;
}
