import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { Worker } from "node:worker_threads";
import type { Transferable as ThreadTransferable } from "node:worker_threads";
import {
  initSync,
  render_fused,
  render_fused_loop_lengths,
  render_fused_modulated,
  render_percussion,
} from "@/wasm/vendor/prism/prism_wasm.js";
import { resolveAssetsDir } from "@/runtime/assets";
import {
  makeSpectralRenderer,
  registerPrismWasm,
  registerPrismWasmWorker,
  type PrismWasmModule,
} from "./prism";
import { PrismWorkerClient, type WorkerLike } from "./prismWorkerClient";

/**
 * Node host for the prism_dsp WASM renderer. Two strategies:
 *  - `worker_threads` (preferred when the worker bundle exists) so long fusion
 *    renders do not block the TUI;
 *  - synchronous in-process (`initSync`) as the fallback for tests/dev.
 */

const WASM_MODULE = {
  render_fused,
  render_fused_modulated,
  render_fused_loop_lengths,
  render_percussion,
} as unknown as PrismWasmModule;

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
    path.resolve(process.cwd(), "src/wasm/vendor/prism/prism_wasm_bg.wasm"),
    path.resolve(base, "..", "..", "src/wasm/vendor/prism/prism_wasm_bg.wasm"),
  ].filter((candidate): candidate is string => typeof candidate === "string");
  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

/** Loads and registers the prism_dsp WASM renderer on this thread. */
export function initPrismWasmNode(): boolean {
  try {
    const wasmPath = findPrismWasmPath();
    if (!wasmPath) return false;
    initSync({ module: readFileSync(wasmPath) });
    registerPrismWasm(WASM_MODULE);
    return true;
  } catch {
    return false;
  }
}

/** Adapts a `worker_threads` Worker to the browser-shaped WorkerLike the client expects. */
class ThreadsWorkerAdapter implements WorkerLike {
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent | Event) => void) | null = null;
  private readonly worker: Worker;

  constructor(worker: Worker) {
    this.worker = worker;
    worker.on("message", (data) => this.onmessage?.({ data } as MessageEvent));
    worker.on("error", (error) =>
      this.onerror?.(error as unknown as ErrorEvent),
    );
  }

  postMessage(message: unknown, transfer?: Transferable[]): void {
    this.worker.postMessage(message, (transfer ?? []) as ThreadTransferable[]);
  }

  terminate(): void {
    void this.worker.terminate();
  }
}

/**
 * Starts the prism worker thread and registers it as the spectral renderer.
 * Returns false (without registering) when the worker bundle or WASM is missing.
 */
export async function initPrismWasmWorker(
  timeoutMs = 10_000,
): Promise<boolean> {
  try {
    const wasmPath = findPrismWasmPath();
    if (!wasmPath) return false;
    const workerUrl = new URL("./prism-worker.mjs", import.meta.url);
    const worker = new Worker(workerUrl, { workerData: { wasmPath } });
    const client = new PrismWorkerClient(new ThreadsWorkerAdapter(worker));
    await client.ping(timeoutMs);
    registerPrismWasmWorker(client);
    return true;
  } catch {
    return false;
  }
}

/** Prefers the worker thread; falls back to a synchronous in-process render. */
export async function initPrismWasm(): Promise<boolean> {
  if (await initPrismWasmWorker()) return true;
  return initPrismWasmNode();
}
