import type { Host, Result } from "../types";
import { browserFs } from "./files";
import { browserAssets } from "./assets";
import { browserConfig } from "./config";
import { browserAudio } from "./audio";

export * from "./files";
export * from "./assets";
export * from "./config";
export * from "./audio";
export * from "./prism";

/** Builds the browser (web-deployed) host. */
export function createBrowserHost(): Host {
  return {
    kind: "browser",
    fs: browserFs,
    assets: browserAssets,
    config: browserConfig,
    audio: browserAudio,
    openExternal,
  };
}

/** Opens a URL in a new browser tab (FEAT-149). */
async function openExternal(url: string): Promise<Result<string>> {
  try {
    window.open(url, "_blank", "noopener,noreferrer");
    return { ok: true, value: url };
  } catch (error) {
    return { ok: false, error: String(error) };
  }
}

export const browserHost: Host = createBrowserHost();
