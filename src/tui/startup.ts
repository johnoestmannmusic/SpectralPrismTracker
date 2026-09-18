import type { LanternConfig } from "@/host/types";

/**
 * Chooses the project to open at startup, or null to use the bundled default.
 *
 * Precedence: explicit `defaultOpen.file` → `defaultOpen.off` (never auto-open)
 * → `lastProject` → null (bundled default).
 */
export function resolveStartupProject(config: LanternConfig): string | null {
  const open = config.defaultOpen;
  if (open?.mode === "file") return open.path;
  if (open?.mode === "off") return null;
  return config.lastProject ?? null;
}
