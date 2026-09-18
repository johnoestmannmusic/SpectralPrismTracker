import { build as viteBuild } from "vite";
import { build as esbuild } from "esbuild";
import { copyFile, cp, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

/**
 * Builds the web deployment (HC003):
 *  - `dist/web/`        static xterm.js client (Vite)
 *  - `dist/web-host/`   Node host that streams the Ink TUI over SSE (esbuild)
 */
const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const src = path.join(projectRoot, "src");
const outDir = path.join(projectRoot, "dist", "web");
const hostDir = path.join(projectRoot, "dist", "web-host");

// 1. Static client.
await viteBuild({
  configFile: path.join(projectRoot, "vite.config.web.mts"),
});

// 2. Node host that runs the actual TUI.
await mkdir(hostDir, { recursive: true });
await esbuild({
  entryPoints: [path.join(src, "web", "server.tsx")],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  sourcemap: true,
  jsx: "automatic",
  alias: { "@": src },
  external: [
    "node-web-audio-api",
    "react-devtools-core",
    "ink",
    "react",
    "react/jsx-runtime",
  ],
  outfile: path.join(hostDir, "server.mjs"),
  logLevel: "warning",
});

// 3. Bundled song/samples (skip the large optional mix WAV).
await cp(path.join(projectRoot, "assets"), path.join(outDir, "assets"), {
  recursive: true,
  filter: (source) => !source.endsWith("flight_school_night_shift.wav"),
});

// 4. prism WASM beside both bundles.
const wasm = path.join(
  projectRoot,
  "src",
  "wasm",
  "vendor",
  "prism",
  "prism_wasm_bg.wasm",
);
await mkdir(path.join(outDir, "assets"), { recursive: true });
await copyFile(wasm, path.join(outDir, "prism_wasm_bg.wasm"));
await copyFile(wasm, path.join(outDir, "assets", "prism_wasm_bg.wasm"));
await copyFile(wasm, path.join(hostDir, "prism_wasm_bg.wasm"));
const worker = path.join(projectRoot, "dist", "tui", "prism-worker.mjs");
if (existsSync(worker))
  await copyFile(worker, path.join(hostDir, "prism-worker.mjs"));

console.log("Web build written to dist/web/ (static) + dist/web-host/ (host)");
console.log("Run it with: npm run serve:web");
