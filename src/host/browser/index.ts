import type { Host } from "../types";
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
  };
}

export const browserHost: Host = createBrowserHost();
