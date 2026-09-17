import os from "node:os";
import path from "node:path";

/**
 * Location of the live control socket. `LANTERN_SOCKET` overrides; otherwise a
 * per-user socket in the temp dir (a named pipe on Windows).
 */
export function resolveSocketPath(
  env: NodeJS.ProcessEnv = process.env,
): string {
  if (env.LANTERN_SOCKET) return env.LANTERN_SOCKET;
  if (process.platform === "win32") {
    return `\\\\.\\pipe\\lantern-${process.env.USERNAME ?? "user"}`;
  }
  return path.join(os.tmpdir(), `lantern-${process.env.USER ?? "user"}.sock`);
}
