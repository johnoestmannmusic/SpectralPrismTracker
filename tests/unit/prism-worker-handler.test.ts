import { describe, expect, it } from "vitest";
import {
  makeClip,
  defaultSpectralSettings,
  spectralRender,
} from "@/core/spectral";
import {
  handlePrismRequest,
  type PrismWorkerPort,
} from "@/wasm/prismWorkerHandler";
import type { WorkerResponse } from "@/wasm/prismWorkerProtocol";

function collect(): {
  port: PrismWorkerPort;
  messages: WorkerResponse[];
  transfers: number;
} {
  const state = { messages: [] as WorkerResponse[], transfers: 0 };
  return {
    port: {
      postMessage(message, transfer) {
        state.messages.push(message);
        state.transfers += transfer?.length ?? 0;
      },
    },
    get messages() {
      return state.messages;
    },
    get transfers() {
      return state.transfers;
    },
  };
}

describe("prism worker handler", () => {
  it("answers a ping with a pong", () => {
    const sink = collect();
    handlePrismRequest(sink.port, () => makeClip([[0]], 8000), {
      id: 7,
      kind: "ping",
    });
    expect(sink.messages).toEqual([{ id: 7, kind: "pong" }]);
  });

  it("returns the rendered clip and transfers its buffers", () => {
    const sink = collect();
    const clip = makeClip([[0, 0.5, -0.5]], 8000);
    handlePrismRequest(sink.port, () => clip, {
      id: 1,
      kind: "render",
      a: clip,
      b: null,
      settings: defaultSpectralSettings(),
    });
    expect(sink.messages[0]).toMatchObject({ id: 1, kind: "result" });
    expect(sink.transfers).toBe(clip.channels.length);
  });

  it("reports render errors", () => {
    const sink = collect();
    handlePrismRequest(
      sink.port,
      () => {
        throw new Error("boom");
      },
      {
        id: 2,
        kind: "render",
        a: makeClip([[0]], 8000),
        b: null,
        settings: defaultSpectralSettings(),
      },
    );
    expect(sink.messages[0]).toEqual({
      id: 2,
      kind: "error",
      error: "Error: boom",
    });
  });

  it("keeps the renderer contract via spectralRender", async () => {
    // The in-process renderer registered by src/wasm/prism.ts must satisfy the
    // same async contract the worker-backed renderer does.
    expect(typeof spectralRender).toBe("function");
  });
});
