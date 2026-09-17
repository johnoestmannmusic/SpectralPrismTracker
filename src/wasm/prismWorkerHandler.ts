import type { WorkerRequest, WorkerResponse } from "./prismWorkerProtocol";
import type { SyncSpectralRenderFn } from "./prism";

export interface PrismWorkerPort {
  postMessage(message: WorkerResponse, transfer?: Transferable[]): void;
}

/**
 * Protocol handler shared by the browser and Node worker entries (and unit
 * tests). Given a render function, answers a single ping/render request.
 */
export function handlePrismRequest(
  port: PrismWorkerPort,
  render: SyncSpectralRenderFn,
  request: WorkerRequest,
): void {
  try {
    if (request.kind === "ping") {
      port.postMessage({ id: request.id, kind: "pong" });
      return;
    }
    const result = render(request.a, request.b, request.settings);
    port.postMessage(
      { id: request.id, kind: "result", result },
      result.channels.map((c) => c.buffer),
    );
  } catch (error) {
    port.postMessage({ id: request.id, kind: "error", error: String(error) });
  }
}
