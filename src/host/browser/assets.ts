import type { LoadedSong } from "@/shared/types";
import type { HostAssets, SourceSampleAsset } from "../types";

/**
 * Browser asset host: loads the bundled project and source samples over HTTP
 * from the app's base URL (Vite serves `assets/` beside the bundle).
 */

function assetUrl(relativePath: string): string {
  const base = import.meta.env?.BASE_URL ?? "/";
  const normalized = base.endsWith("/") ? base : `${base}/`;
  return `${normalized}assets/${relativePath}`;
}

async function fetchBytes(relativePath: string): Promise<Uint8Array | null> {
  try {
    const response = await fetch(assetUrl(relativePath));
    if (!response.ok) return null;
    return new Uint8Array(await response.arrayBuffer());
  } catch {
    return null;
  }
}

async function fetchText(relativePath: string): Promise<string | null> {
  const bytes = await fetchBytes(relativePath);
  return bytes ? new TextDecoder().decode(bytes) : null;
}

export async function listSourceSamples(): Promise<SourceSampleAsset[]> {
  return Promise.all(
    [0, 1, 2, 3, 4, 5].map(async (index) => {
      const path = assetUrl(`SourceSamples/${index}.ogg`);
      const bytes = await fetchBytes(`SourceSamples/${index}.ogg`);
      return { index, path, present: bytes !== null, bytes };
    }),
  );
}

export async function loadDefaultSong(): Promise<
  LoadedSong | { error: string }
> {
  const project = await fetchText("lmp-default-proj.sptproj");
  if (project === null) {
    return {
      error: `Cannot find the bundled project assets at ${assetUrl("")}`,
    };
  }
  const samples = await Promise.all(
    [0, 1, 2, 3, 4, 5].map((i) => fetchBytes(`SourceSamples/${i}.ogg`)),
  );
  return { project, samples };
}

/** Browser implementation of the asset host contract. */
export const browserAssets: HostAssets = {
  listSourceSamples,
  loadDefaultSong,
};
