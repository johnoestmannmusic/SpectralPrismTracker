import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  initSync,
  render_fused,
  render_fused_loop_lengths,
  render_fused_modulated,
  render_percussion,
} from "@/renderer/vendor/prism/prism_wasm.js";
import { resolveAssetsDir } from "@/runtime/assets";
import {
  makeSpectralRenderer,
  registerPrismWasm,
  type PrismWasmModule,
} from "./prism";

/**
 * Node loader for the prism_dsp WASM module. Unlike the browser worker path
 * this runs synchronously on the calling thread, which is fine for the initial
 * fusion renders. (A worker_threads host can replace this later without
 * changing the registered renderer contract.)
 */

function scriptDir(): string {
  const entry = process.argv[1];
  return entry ? path.dirname(path.resolve(entry)) : process.cwd();
}

export function findPrismWasmPath(): string | null {
  const env = process.env.LANTERN_PRISM_WASM;
  const base = scriptDir();
  const candidates = [
    env,
    path.join(resolveAssetsDir(), "prism_wasm_bg.wasm"),
    path.join(base, "prism_wasm_bg.wasm"),
    path.resolve(base, "..", "prism_wasm_bg.wasm"),
    path.resolve(process.cwd(), "src/renderer/vendor/prism/prism_wasm_bg.wasm"),
    path.resolve(
      base,
      "..",
      "..",
      "src/renderer/vendor/prism/prism_wasm_bg.wasm",
    ),
  ].filter((candidate): candidate is string => typeof candidate === "string");
  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

/** Loads and registers the prism_dsp WASM renderer. Returns false when unavailable. */
export function initPrismWasmNode(): boolean {
  try {
    const wasmPath = findPrismWasmPath();
    if (!wasmPath) return false;
    initSync({ module: readFileSync(wasmPath) });
    registerPrismWasm({
      render_fused,
      render_fused_modulated,
      render_fused_loop_lengths,
      render_percussion,
    } as unknown as PrismWasmModule);
    return true;
  } catch {
    return false;
  }
}
