import type { Host } from "../types";
import { nodeFs } from "./files";
import { nodeAssets } from "./assets";
import { nodeConfig } from "./config";
import { nodeAudio } from "./audio";
import { openExternal } from "./openExternal";

export * from "./openExternal";
export * from "./files";
export * from "./assets";
export * from "./config";
export * from "./audio";

/** Builds a Node host, optionally with an env-bound config store (tests). */
export function createNodeHost(config = nodeConfig): Host {
  return {
    kind: "node",
    fs: nodeFs,
    assets: nodeAssets,
    config,
    audio: nodeAudio,
    openExternal,
  };
}

/** Default Node host (process env, real filesystem). */
export const nodeHost: Host = createNodeHost();
