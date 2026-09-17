#!/usr/bin/env node
/**
 * Vendors the SpectralPrism `prism_dsp` crate into this repo so the WASM
 * engine can be rebuilt without a sibling checkout (FEAT-7, option b).
 *
 * The crate is actively developed in the SpectralPrism repo, so this script
 * is the single re-vendor entry point: point it at the checkout (or set
 * PRISM_DSP_SRC) and re-run `npm run build:prism-wasm` afterwards.
 *
 *   node scripts/vendor-prism-dsp.mjs [sourceDir]
 *   PRISM_DSP_SRC=/path/to/prism_dsp node scripts/vendor-prism-dsp.mjs
 */
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const argSource = process.argv[2];
const source = path.resolve(
  projectRoot,
  argSource ??
    process.env.PRISM_DSP_SRC ??
    "../../SpectralPrism/crates/prism_dsp",
);
const destination = path.join(projectRoot, "native/prism_dsp");

if (!existsSync(path.join(source, "src"))) {
  console.error(`prism_dsp sources not found under ${source}/src`);
  console.error(
    "Pass the crate directory as an argument or set PRISM_DSP_SRC.",
  );
  process.exit(1);
}

const sourceCargo = readFileSync(path.join(source, "Cargo.toml"), "utf8");

function workspaceVersion(crateDir) {
  const rootCargo = path.join(crateDir, "../../Cargo.toml");
  if (!existsSync(rootCargo)) return "0.0.0";
  const match = readFileSync(rootCargo, "utf8").match(
    /\[workspace\.package\][\s\S]*?\nversion\s*=\s*"([^"]+)"/,
  );
  return match ? match[1] : "0.0.0";
}

const version = /version\.workspace\s*=\s*true/.test(sourceCargo)
  ? workspaceVersion(source)
  : "0.0.0";

rmSync(destination, { recursive: true, force: true });
mkdirSync(destination, { recursive: true });
cpSync(path.join(source, "src"), path.join(destination, "src"), {
  recursive: true,
});

// A standalone manifest: the upstream one inherits version/edition from the
// SpectralPrism workspace, which does not exist here.
writeFileSync(
  path.join(destination, "Cargo.toml"),
  `[package]
name = "prism_dsp"
version = "${version}"
edition = "2021"
license = "MIT"
description = "Vendored SpectralPrism DSP core (freeze/fusion/modulation/percussion). Do not edit by hand; re-run scripts/vendor-prism-dsp.mjs."

[dependencies]
realfft = "3.5"
`,
);

const license = path.join(source, "../../LICENSE");
if (existsSync(license)) {
  cpSync(license, path.join(destination, "LICENSE"));
}

writeFileSync(
  path.join(destination, "README.md"),
  `# Vendored prism_dsp

Copied from the SpectralPrism repo's \`crates/prism_dsp\` by
\`scripts/vendor-prism-dsp.mjs\`. **Do not edit these sources here** — the DSP is
developed in SpectralPrism, then re-vendored:

\`\`\`sh
node scripts/vendor-prism-dsp.mjs /path/to/SpectralPrism/crates/prism_dsp
npm run build:prism-wasm
\`\`\`

\`native/prism-wasm/Cargo.toml\` points at this directory, so the app builds the
Spectral engine without any external checkout.
`,
);

console.log(`Vendored prism_dsp ${version} from ${source} -> ${destination}`);
console.log("Now run: npm run build:prism-wasm");
