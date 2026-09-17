#!/usr/bin/env node
/**
 * Builds the prism_dsp Spectral engine to WASM (0007E-PLAN-011).
 *
 * Requires: the `wasm32-unknown-unknown` Rust target (installed), plus either
 * `wasm-pack` or `wasm-bindgen-cli`. If neither is present this script prints
 * install instructions and exits without touching the app, since the Spectral
 * engine is a deferred feature and the Sampler path works without it.
 */
import { spawnSync } from "node:child_process";
import { cpSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const crateDir = path.join(projectRoot, "native/prism-wasm");
const outDir = path.join(crateDir, "pkg");
const vendorDir = path.join(projectRoot, "src/wasm/vendor/prism");
// These are the wasm-bindgen outputs the app imports; `loader.ts` is
// hand-written and lives alongside them, so it is never overwritten.
const artifacts = [
  "prism_wasm.js",
  "prism_wasm.d.ts",
  "prism_wasm_bg.wasm",
  "prism_wasm_bg.wasm.d.ts",
];
// `native/prism-wasm/Cargo.toml` points prism_dsp at the vendored crate.
const prismDspDir = path.join(projectRoot, "native/prism_dsp");

if (!existsSync(path.join(prismDspDir, "src"))) {
  console.error(`Vendored prism_dsp sources not found at ${prismDspDir}/src`);
  console.error("Re-vendor them from a SpectralPrism checkout:");
  console.error(
    "  node scripts/vendor-prism-dsp.mjs /path/to/SpectralPrism/crates/prism_dsp",
  );
  process.exit(1);
}

function has(command) {
  return spawnSync(command, ["--version"], { stdio: "ignore" }).status === 0;
}

/** Copies the freshly built WASM artifacts into the app's checked-in vendor dir. */
function publishArtifacts() {
  for (const name of artifacts) {
    const from = path.join(outDir, name);
    if (!existsSync(from)) {
      console.error(`Expected WASM artifact missing: ${from}`);
      process.exit(1);
    }
    cpSync(from, path.join(vendorDir, name));
  }
  console.log(
    `Published WASM artifacts to ${path.relative(projectRoot, vendorDir)}/`,
  );
}

if (!has("wasm-pack") && !has("wasm-bindgen")) {
  console.error(
    "prism_dsp WASM build skipped: neither wasm-pack nor wasm-bindgen is installed.",
  );
  console.error("Install one, then re-run `npm run build:prism-wasm`:");
  console.error("  cargo install wasm-pack");
  console.error("  # or: cargo install wasm-bindgen-cli");
  process.exit(0);
}

const args = has("wasm-pack")
  ? ["build", "--release", "--target", "web", "--out-dir", outDir, crateDir]
  : null;

if (args) {
  const result = spawnSync("wasm-pack", args, { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
  publishArtifacts();
  process.exit(0);
}

// wasm-bindgen-cli fallback: build then bind.
const build = spawnSync(
  "cargo",
  [
    "build",
    "--release",
    "--target",
    "wasm32-unknown-unknown",
    "--manifest-path",
    path.join(crateDir, "Cargo.toml"),
  ],
  { stdio: "inherit" },
);
if (build.status !== 0) process.exit(build.status ?? 1);
const wasm = path.join(
  crateDir,
  "target/wasm32-unknown-unknown/release/prism_wasm.wasm",
);
if (!existsSync(wasm)) {
  console.error(`Expected WASM at ${wasm}`);
  process.exit(1);
}
const bindgen = spawnSync(
  "wasm-bindgen",
  ["--target", "web", "--out-dir", outDir, wasm],
  {
    stdio: "inherit",
  },
);
if (bindgen.status !== 0) process.exit(bindgen.status ?? 1);
publishArtifacts();
