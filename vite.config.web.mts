import { defineConfig, type Plugin } from "vite";
import { fileURLToPath } from "node:url";

const src = fileURLToPath(new URL("./src", import.meta.url));
const webRoot = fileURLToPath(new URL("./src/web", import.meta.url));
const outDir = fileURLToPath(new URL("./dist/web", import.meta.url));

const d = new Date();
const buildDate = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;

const shim = (name: string): string =>
  fileURLToPath(new URL(`./src/web/shims/${name}.ts`, import.meta.url));

/**
 * chalk's browser colour detector returns level 0 in Firefox/Safari, which
 * strips every Ink colour from the web TUI. Intercept its internal
 * `#supports-color` import and swap in a truecolor stub (see
 * `src/web/shims/chalkColor.ts`).
 */
function forceChalkTruecolor(): Plugin {
  return {
    name: "force-chalk-truecolor",
    enforce: "pre",
    resolveId(source, importer) {
      if (source === "#supports-color" && importer?.includes("chalk")) {
        return shim("chalkColor");
      }
      return undefined;
    },
  };
}

/**
 * Static client for the web deployment (HC005).
 *
 * The TUI runs entirely in the browser: this bundle contains the Ink app, the
 * browser Host, and the xterm frame. Ink and its dependencies import a handful
 * of Node builtins, so we alias them to the tiny browser shims in
 * `src/web/shims/`. There is no Node host and no server-side session.
 */
export default defineConfig({
  root: webRoot,
  base: "./",
  plugins: [forceChalkTruecolor()],
  resolve: {
    alias: [
      // Node builtins used by Ink and its transitive dependencies.
      { find: /^node:process$/, replacement: shim("process") },
      { find: /^node:stream$/, replacement: shim("stream") },
      { find: /^node:events$/, replacement: shim("events") },
      { find: /^node:fs$/, replacement: shim("fs") },
      { find: /^node:os$/, replacement: shim("os") },
      { find: /^node:tty$/, replacement: shim("tty") },
      { find: /^node:child_process$/, replacement: shim("child_process") },
      { find: /^node:path$/, replacement: shim("path") },
      { find: /^node:vm$/, replacement: shim("vm") },
      { find: /^node:assert$/, replacement: shim("assert") },
      { find: /^node:module$/, replacement: shim("module") },
      // Bare specifiers some dependencies use instead of the node: prefix.
      { find: /^process$/, replacement: shim("process") },
      { find: /^stream$/, replacement: shim("stream") },
      { find: /^events$/, replacement: shim("events") },
      { find: /^os$/, replacement: shim("os") },
      { find: /^tty$/, replacement: shim("tty") },
      { find: /^child_process$/, replacement: shim("child_process") },
      { find: /^vm$/, replacement: shim("vm") },
      { find: /^assert$/, replacement: shim("assert") },
      { find: /^module$/, replacement: shim("module") },
      // `ws` is only used by Ink's devtools modules, which the web never loads.
      { find: /^ws$/, replacement: shim("ws") },
      { find: "@", replacement: src },
    ],
  },
  define: {
    __BUILD_DATE__: JSON.stringify(buildDate),
    global: "globalThis",
  },
  build: {
    outDir,
    emptyOutDir: true,
    target: "chrome120",
    sourcemap: true,
    // The Ink/React app chunk is ~535 kB; third-party code is split out (below).
    chunkSizeWarningLimit: 600,
    // Keep Ink + React + their dynamic devtools import in one chunk: splitting
    // them made Ink's optional `react-devtools-core` import unresolvable at
    // runtime. Only independent vendor code is split out for caching.
    rollupOptions: {
      output: {
        manualChunks(id: string): string | undefined {
          if (id.includes("node_modules/@xterm")) return "vendor-xterm";
          if (id.includes("node_modules/yoga-layout")) return "vendor-yoga";
          return undefined;
        },
      },
    },
  },
});
