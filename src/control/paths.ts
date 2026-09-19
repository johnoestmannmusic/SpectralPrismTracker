import os from "node:os";
import path from "node:path";

/**
 * Location of the live control socket. `SPT_SOCKET` (legacy `LANTERN_SOCKET`)
 * overrides; otherwise a per-user socket in the temp dir (a named pipe on
 * Windows).
 */
export function resolveSocketPath(
  env: NodeJS.ProcessEnv = process.env,
): string {
  const override = env.SPT_SOCKET ?? env.LANTERN_SOCKET;
  if (override) return override;
  if (process.platform === "win32") {
    return `\\\\.\\pipe\\spectralprism-${process.env.USERNAME ?? "user"}`;
  }
  return path.join(
    os.tmpdir(),
    `spectralprism-${process.env.USER ?? "user"}.sock`,
  );
}
