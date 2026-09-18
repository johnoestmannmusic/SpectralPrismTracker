import init, {
  initSync,
  render_fused,
  render_fused_loop_lengths,
  render_fused_modulated,
  render_microtextures,
  render_percussion,
} from "@/wasm/vendor/prism/prism_wasm.js";
import {
  registerPrismWasm,
  registerPrismWasmWorker,
  type PrismWasmModule,
} from "@/wasm/prism";
import {
  createBrowserWorker,
  PrismWorkerClient,
} from "@/wasm/prismWorkerClient";

/**
 * Browser host for the prism_dsp WASM renderer.
 *
 * Prefers the Web Worker (keeps long fusion renders off the UI thread) and
 * falls back to a synchronous in-process render using the wasm fetched from
 * the app base URL.
 */

const WASM_MODULE = {
  render_fused,
  render_fused_modulated,
  render_fused_loop_lengths,
  render_percussion,
  render_microtextures,
} as unknown as PrismWasmModule;

function wasmUrl(): string {
  const base = import.meta.env?.BASE_URL ?? "/";
  const normalized = base.endsWith("/") ? base : `${base}/`;
  return `${normalized}prism_wasm_bg.wasm`;
}

async function initInProcess(): Promise<boolean> {
  try {
    const response = await fetch(wasmUrl());
    if (!response.ok) return false;
    const bytes = new Uint8Array(await response.arrayBuffer());
    initSync({ module: bytes });
    registerPrismWasm(WASM_MODULE);
    return true;
  } catch {
    return false;
  }
}

/** Initialises the prism WASM renderer in the browser. */
export async function initPrismWasmBrowser(
  timeoutMs = 10_000,
): Promise<boolean> {
  try {
    const client = new PrismWorkerClient(createBrowserWorker());
    await client.ping(timeoutMs);
    registerPrismWasmWorker(client);
    return true;
  } catch {
    return initInProcess();
  }
}

/**
 * Kept for parity with the Node host: the default `init()` path would fetch the
 * wasm relative to the vendored module, which we avoid in favour of wasmUrl().
 */
export async function initPrismWasmDefault(): Promise<boolean> {
  try {
    await init({ module_or_path: wasmUrl() });
    registerPrismWasm(WASM_MODULE);
    return true;
  } catch {
    return initInProcess();
  }
}
