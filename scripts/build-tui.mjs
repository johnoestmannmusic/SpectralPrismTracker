import { build } from "esbuild";
import { copyFile, cp, mkdir, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const src = path.join(projectRoot, "src");
const dist = path.join(projectRoot, "dist", "tui");

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

await build({
  entryPoints: [path.join(src, "tui", "main.tsx")],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  sourcemap: true,
  jsx: "automatic",
  alias: { "@": src },
  // Keep native bindings and React/Ink external: Ink conditionally imports the
  // optional react-devtools-core peer, which must resolve at runtime, and both
  // Ink and our components must share one React instance.
  external: [
    "node-web-audio-api",
    "react-devtools-core",
    "ink",
    "react",
    "react/jsx-runtime",
  ],
  banner: { js: "#!/usr/bin/env node" },
  outfile: path.join(dist, "main.mjs"),
  logLevel: "info",
});

// Spectral renders run in a worker thread so long fusion renders never block the UI.
await build({
  entryPoints: [path.join(src, "wasm", "prism.worker.node.ts")],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  sourcemap: true,
  alias: { "@": src },
  outfile: path.join(dist, "prism-worker.mjs"),
  logLevel: "info",
});

// .lmpscript / agent client: talks to the running app's control socket.
await build({
  entryPoints: [path.join(src, "control", "runScript.ts")],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  sourcemap: true,
  alias: { "@": src },
  banner: { js: "#!/usr/bin/env node" },
  outfile: path.join(dist, "run-script.mjs"),
  logLevel: "info",
});

// Ship assets + WASM beside the bundle so the app runs from any cwd.
await cp(path.join(projectRoot, "assets"), path.join(dist, "assets"), {
  recursive: true,
});
await copyFile(
  path.join(src, "wasm", "vendor", "prism", "prism_wasm_bg.wasm"),
  path.join(dist, "prism_wasm_bg.wasm"),
);

console.log("TUI build complete: dist/tui/main.mjs");
