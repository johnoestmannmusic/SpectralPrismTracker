import { build as viteBuild } from "vite";
import {
  copyFile,
  cp,
  mkdir,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Builds the web deployment (HC005).
 *
 * `dist/web/` is a completely static client-side app: the browser Host, the
 * Session and the Ink TUI all run in the visitor's page. There is no Node host
 * and no server-side session. `vite` emits the hashed bundle; this script then
 * copies the runtime assets (project, samples, bundled WAV, prism WASM) beside
 * it so a plain static file server can serve the folder as-is.
 */
const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const src = path.join(projectRoot, "src");
const outDir = path.join(projectRoot, "dist", "web");

// 1. Static client. `vite.config.web.mts` injects __BUILD_DATE__ and aliases
// Ink's Node builtins to the browser shims.
await viteBuild({
  configFile: path.join(projectRoot, "vite.config.web.mts"),
});

// 2. Bundled song/samples (skip the large optional mix WAV). `cp` merges, so a
// sample removed from `assets/` would otherwise linger in `dist/` and still be
// served (BUG: Download WAV kept serving the previous, replaced file). Clear
// only the entries that come from `assets/` first: Vite's hashed client bundle
// lives in the same `dist/web/assets/` folder and must survive.
const assetsSrc = path.join(projectRoot, "assets");
const assetsDest = path.join(outDir, "assets");
await mkdir(assetsDest, { recursive: true });
for (const entry of await readdir(assetsSrc)) {
  await rm(path.join(assetsDest, entry), { recursive: true, force: true });
}
await cp(assetsSrc, assetsDest, {
  recursive: true,
  filter: (source) => !source.endsWith("flight_school_night_shift.wav"),
});

// 2b. Manifest of bundled export WAVs so the client can pick one without a
// directory listing (the previous Node host listed the folder at request time).
const wavDir = path.join(assetsDest, "WAVExport");
try {
  const wavFiles = (await readdir(wavDir)).filter((name) =>
    name.toLowerCase().endsWith(".wav"),
  );
  const entries = await Promise.all(
    wavFiles.map(async (name) => ({
      name,
      mtime: (await stat(path.join(wavDir, name))).mtimeMs,
    })),
  );
  entries.sort((a, b) => b.mtime - a.mtime || a.name.localeCompare(b.name));
  await writeFile(
    path.join(wavDir, "manifest.json"),
    JSON.stringify({ files: entries.map((entry) => entry.name) }, null, 2),
  );
} catch {
  /* no bundled WAVs — Download WAV will simply have nothing to fetch */
}

// 3. prism WASM beside the bundle for the in-process fallback path.
const wasm = path.join(src, "wasm", "vendor", "prism", "prism_wasm_bg.wasm");
await mkdir(path.join(outDir, "assets"), { recursive: true });
await copyFile(wasm, path.join(outDir, "prism_wasm_bg.wasm"));
await copyFile(wasm, path.join(outDir, "assets", "prism_wasm_bg.wasm"));

console.log("Static web build written to dist/web/ (serve the folder as-is).");
