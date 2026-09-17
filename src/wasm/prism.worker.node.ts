import { readFileSync } from "node:fs";
import {
  parentPort,
  workerData,
  type Transferable as ThreadTransferable,
} from "node:worker_threads";
import {
  initSync,
  render_fused,
  render_fused_loop_lengths,
  render_fused_modulated,
  render_percussion,
} from "@/wasm/vendor/prism/prism_wasm.js";
import { makeSpectralRenderer, type PrismWasmModule } from "./prism";
import { handlePrismRequest } from "./prismWorkerHandler";
import type { WorkerRequest } from "./prismWorkerProtocol";

/**
 * Node `worker_threads` entry for prism_dsp renders. Mirrors the browser
 * `prism.worker.ts` protocol so `PrismWorkerClient` works unchanged.
 */
const port = parentPort;
if (!port) throw new Error("prism worker requires a parent port");

const { wasmPath } = workerData as { wasmPath: string };
initSync({ module: readFileSync(wasmPath) });
const render = makeSpectralRenderer({
  render_fused,
  render_fused_modulated,
  render_fused_loop_lengths,
  render_percussion,
} as unknown as PrismWasmModule);

port.on("message", (request: WorkerRequest) => {
  handlePrismRequest(
    {
      postMessage: (message, transfer) =>
        port.postMessage(message, (transfer ?? []) as ThreadTransferable[]),
    },
    render,
    request,
  );
});
