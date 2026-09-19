#!/usr/bin/env node
/**
 * Folder-distribution build (FEAT-170).
 *
 * Assembles `dist/spectralprism-tracker/`: a runnable copy of the desktop TUI
 * that needs no repo checkout — only Node >= 22 on PATH. It is NOT a
 * single-file binary; native deps and runtime assets are kept beside the
 * bundle because that is how the app resolves them (see docs/PLATFORMS.md).
 *
 * Layout:
 *   spectralprism-tracker/
 *     spt / spt.cmd           launcher for the TUI
 *     spt-run / spt-run.cmd   launcher for .lmpscript / agent scripts
 *     main.mjs                bundled TUI (esbuild, node22, ESM)
 *     prism-worker.mjs        spectral render worker thread
 *     prism_wasm_bg.wasm      Prism DSP
 *     assets/                 source samples + bundled default project
 *     node_modules/           production closure of ink/react/node-web-audio-api
 *     README.txt              run instructions
 *     VERSION
 *
 * Usage:
 *   node scripts/build-dist.mjs              assemble the folder
 *   node scripts/build-dist.mjs --archive    also emit a .tar.gz next to it
 */
import {
  cp,
  mkdir,
  readFile,
  rm,
  stat,
  writeFile,
  chmod,
} from "node:fs/promises";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const distRoot = path.join(projectRoot, "dist");
const tuiDir = path.join(distRoot, "tui");
const folderName = "spectralprism-tracker";
const outDir = path.join(distRoot, folderName);
const withArchive = process.argv.includes("--archive");

const pkg = JSON.parse(
  await readFile(path.join(projectRoot, "package.json"), "utf8"),
);
const buildDate = (() => {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(
    d.getDate(),
  ).padStart(2, "0")}`;
})();

function run(command, args, label) {
  const result = spawnSync(command, args, {
    cwd: projectRoot,
    stdio: "inherit",
  });
  if (result.status !== 0) {
    throw new Error(`${label} failed with exit code ${result.status}`);
  }
}

/** Packages that exist only for the web/dev build and are not needed at TUI runtime. */
const EXCLUDED = [/^@xterm\//, /^@types\//, /^csstype$/];

/**
 * Production dependency closure, read from the installed tree so the build is
 * offline-reliable. `npm ls --parseable` lists absolute paths including nested
 * node_modules, which is exactly the layout we need to reproduce.
 */
function productionPackagePaths() {
  const npm = process.platform === "win32" ? "npm.cmd" : "npm";
  const result = spawnSync(npm, ["ls", "--omit=dev", "--parseable", "--all"], {
    cwd: projectRoot,
    encoding: "utf8",
  });
  if (result.status !== 0 && !result.stdout) {
    throw new Error(
      `Could not enumerate production dependencies:\n${result.stderr ?? ""}`,
    );
  }
  const marker = `${path.sep}node_modules${path.sep}`;
  const seen = new Set();
  const entries = [];
  for (const raw of (result.stdout ?? "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || !line.includes(marker)) continue;
    const rel = path.relative(projectRoot, line);
    if (rel.startsWith("..") || path.isAbsolute(rel)) continue;
    // rel looks like node_modules/pkg or node_modules/pkg/node_modules/dep
    const parts = rel.split(path.sep);
    if (parts[0] !== "node_modules" || parts.length < 2) continue;
    const pkgName = parts[1].startsWith("@")
      ? `${parts[1]}/${parts[2]}`
      : parts[1];
    if (EXCLUDED.some((re) => re.test(pkgName))) continue;
    if (seen.has(rel)) continue;
    seen.add(rel);
    entries.push({ abs: line, rel });
  }
  return entries;
}

/** Copy only the runtime files from dist/tui (drop source maps). */
async function copyTui() {
  if (!existsSync(path.join(tuiDir, "main.mjs"))) {
    throw new Error(
      "dist/tui/main.mjs is missing — run npm run build:tui first",
    );
  }
  await cp(tuiDir, outDir, {
    recursive: true,
    filter: (source) => !source.endsWith(".map"),
  });
}

async function copyDependencies() {
  const entries = productionPackagePaths();
  for (const { abs, rel } of entries) {
    const dest = path.join(outDir, rel);
    await mkdir(path.dirname(dest), { recursive: true });
    await cp(abs, dest, { recursive: true, dereference: true });
  }
  return entries.length;
}

const POSIX_LAUNCHER = (entry) => `#!/bin/sh
# SpectralPrism Tracker launcher (requires Node >= 22 on PATH).
DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
exec node "$DIR/${entry}" "$@"
`;

const CMD_LAUNCHER = (entry) => `@echo off
rem SpectralPrism Tracker launcher (requires Node >= 22 on PATH).
node "%~dp0${entry}" %*
`;

async function writeLaunchers() {
  const files = [
    ["spt", POSIX_LAUNCHER("main.mjs"), 0o755],
    ["spt.cmd", CMD_LAUNCHER("main.mjs"), 0o644],
    ["spt-run", POSIX_LAUNCHER("run-script.mjs"), 0o755],
    ["spt-run.cmd", CMD_LAUNCHER("run-script.mjs"), 0o644],
  ];
  for (const [name, contents, mode] of files) {
    const file = path.join(outDir, name);
    await writeFile(file, contents);
    await chmod(file, mode);
  }
}

async function writeDocs() {
  const readme = `SpectralPrism Tracker — desktop build ${pkg.version} (${buildDate})

Requires Node.js 22 or newer on PATH: https://nodejs.org/

  macOS / Linux:  ./spt
  Windows:        spt.cmd

Controls: / opens the command palette, ? shows help, Space plays,
/quit or /exit leaves the app.

This is a folder distribution: the native audio module and bundled assets live
beside main.mjs and must be kept together. Do not move individual files out of
this folder.
`;
  await writeFile(path.join(outDir, "README.txt"), readme);
  await writeFile(
    path.join(outDir, "VERSION"),
    `spectralprism-tracker ${pkg.version} (build ${buildDate})\n`,
  );
}

/**
 * Fail the build if a required external cannot be resolved from inside the
 * assembled folder. Catches missing transitive deps before shipping.
 */
function verifyResolution() {
  const require = createRequire(path.join(outDir, "main.mjs"));
  const externals = ["ink", "react", "react/jsx-runtime", "node-web-audio-api"];
  const missing = [];
  for (const id of externals) {
    try {
      require.resolve(id);
    } catch {
      missing.push(id);
    }
  }
  for (const file of ["main.mjs", "prism-worker.mjs", "prism_wasm_bg.wasm"]) {
    if (!existsSync(path.join(outDir, file))) missing.push(file);
  }
  if (!existsSync(path.join(outDir, "assets"))) missing.push("assets/");
  if (missing.length) {
    throw new Error(
      `Distribution is incomplete — could not resolve: ${missing.join(", ")}`,
    );
  }
}

async function makeArchive() {
  const archive = path.join(
    distRoot,
    `${folderName}-${pkg.version}-${process.platform}-${process.arch}.tar.gz`,
  );
  const result = spawnSync(
    "tar",
    ["-czf", archive, "-C", distRoot, folderName],
    {
      stdio: "inherit",
    },
  );
  if (result.status !== 0) {
    console.warn("  warn  tar unavailable — skipped archive");
    return;
  }
  console.log(`Archive: ${path.relative(projectRoot, archive)}`);
}

async function folderSize(dir) {
  let total = 0;
  const { readdir } = await import("node:fs/promises");
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) total += await folderSize(full);
    else if (entry.isFile()) total += (await stat(full)).size;
  }
  return total;
}

console.log("Building TUI bundle…");
run(
  process.execPath,
  [path.join(projectRoot, "scripts", "build-tui.mjs")],
  "build:tui",
);

console.log(`Assembling ${path.relative(projectRoot, outDir)}/ …`);
await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });
await copyTui();
const depCount = await copyDependencies();
await writeLaunchers();
await writeDocs();
verifyResolution();

const mb = (await folderSize(outDir)) / (1024 * 1024);
console.log(
  `Folder distribution ready: ${path.relative(projectRoot, outDir)}/ ` +
    `(${depCount} packages, ${mb.toFixed(1)} MB)`,
);
console.log("Run it with: ./dist/spectralprism-tracker/spt");

if (withArchive) await makeArchive();
