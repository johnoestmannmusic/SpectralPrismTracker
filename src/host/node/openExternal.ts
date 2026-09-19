import { spawn } from "node:child_process";
import type { Result } from "../types";

/**
 * Opens a URL in the platform browser (FEAT-149). Uses the OS opener directly
 * (no new dependency, HC004): `open` on macOS, `cmd /c start` on Windows and
 * `xdg-open` elsewhere. Resolves ok once the process spawns.
 */
export function openExternal(url: string): Promise<Result<string>> {
  return new Promise((resolve) => {
    const platform = process.platform;
    const command =
      platform === "win32"
        ? "cmd"
        : platform === "darwin"
          ? "open"
          : "xdg-open";
    const args = platform === "win32" ? ["/c", "start", "", url] : [url];
    try {
      const child = spawn(command, args, {
        detached: true,
        stdio: "ignore",
      });
      child.on("error", (error) =>
        resolve({ ok: false, error: String(error) }),
      );
      child.on("spawn", () => {
        child.unref();
        resolve({ ok: true, value: url });
      });
    } catch (error) {
      resolve({ ok: false, error: String(error) });
    }
  });
}
