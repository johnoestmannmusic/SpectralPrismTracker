import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

const src = fileURLToPath(new URL("./src", import.meta.url));
const webRoot = fileURLToPath(new URL("./src/web", import.meta.url));
const outDir = fileURLToPath(new URL("./dist/web", import.meta.url));

const d = new Date();
const buildDate = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;

/**
 * Static client for the web deployment. The TUI itself runs in the Node host
 * (`src/web/server.ts`) and is streamed to this page over SSE, so the client
 * bundle only needs xterm.js and the shell buttons.
 */
export default defineConfig({
  root: webRoot,
  base: "./",
  resolve: { alias: { "@": src } },
  define: { __BUILD_DATE__: JSON.stringify(buildDate) },
  build: {
    outDir,
    emptyOutDir: true,
    target: "chrome120",
    sourcemap: true,
  },
});
