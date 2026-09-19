import { afterAll, describe, expect, it } from "vitest";
import { Session } from "@/tui/session";
import { openPath } from "@/tui/io";
import { renderSamplerMix, wavPcm16 } from "@/core/export";
import { sequenceFromSong } from "@/core/sampler";

function log(message: string): void {
  process.stderr.write(`${message}\n`);
}

describe("tmp perf", () => {
  const session = new Session();
  afterAll(() => session.dispose());
  it("times a full-project mix + encode", async () => {
    const t0 = Date.now();
    await session.init();
    log(`PERF init ${Date.now() - t0}ms`);
    const t1 = Date.now();
    const opened = await openPath(session, "project.sptproj");
    log(`PERF open ${Date.now() - t1}ms ok=${opened.ok}`);
    expect(opened.ok).toBe(true);
    const engine = session.backend!;
    const t2 = Date.now();
    const deadline = Date.now() + 20_000;
    while (!engine.samplerReady() && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 50));
    }
    log(
      `PERF samplerReady=${engine.samplerReady()} wait=${Date.now() - t2}ms duration=${engine.songDuration().toFixed(2)}s`,
    );
    const state = session.getState();
    const clips = state.settings.map((_, i) => engine.effectiveClip(i));
    const sequence = sequenceFromSong(session.song!, state.settings);
    log(`PERF sequence rows=${sequence.rows.length}`);
    const t3 = Date.now();
    let base;
    try {
      base = renderSamplerMix(
        sequence,
        state.settings,
        clips,
        state.channelVolume,
        state.channelMuted,
        state.masterVolume,
      );
    } catch (error) {
      log(`PERF mix threw ${String(error)}`);
      throw error;
    }
    log(`PERF mix=${Date.now() - t3}ms frames=${base.channels[0]?.length}`);
    const t4 = Date.now();
    const bytes = wavPcm16(base, { title: "perf" });
    log(`PERF encode=${Date.now() - t4}ms bytes=${bytes.length}`);
    expect(bytes.length).toBeGreaterThan(44);
  }, 35_000);
});