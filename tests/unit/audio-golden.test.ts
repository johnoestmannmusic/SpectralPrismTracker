import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { applyMasterFxOffline } from "@/audio/offline";
import { createMasterFxGraph } from "@/audio/masterFxGraph";
import {
  DOWNSAMPLE_WORKLET_NAME,
  DOWNSAMPLE_WORKLET_URL,
} from "@/audio/downsampleWorklet";
import { defaultMasterFx, masterFxFromJson } from "@/core/masterFx";
import { audioClip, downsampleClip } from "@/core/dsp";
import { installWebAudioGlobals } from "@/runtime/audio";

/**
 * Golden regression for the offline render path. Reverb is disabled because its
 * impulse response is randomised; delay is fully deterministic, so the rendered
 * PCM must match the committed fixture exactly. Regenerate with
 * `UPDATE_GOLDEN=1 npx vitest run tests/unit/audio-golden.test.ts`.
 */

const goldenDir = fileURLToPath(new URL("../fixtures/golden", import.meta.url));
const goldenPath = path.join(goldenDir, "master-fx-delay.json");

function fixtureClip() {
  const frames = 4096;
  const data = new Float32Array(frames);
  for (let i = 0; i < frames; i++) data[i] = Math.sin((i / 32) * Math.PI) * 0.8;
  return audioClip([data], 44_100);
}

function settings() {
  const base = defaultMasterFx();
  return {
    ...base,
    delay: {
      enabled: true,
      timeSec: 0.2,
      feedback: 0.3,
      toneHz: 4000,
      mix: 0.5,
    },
    reverb: { ...base.reverb, enabled: false, mix: 0 },
  };
}

function digest(clip: { channels: Float32Array[]; sampleRate: number }): {
  hash: string;
  frames: number;
  peak: number;
} {
  const hash = createHash("sha256");
  let peak = 0;
  for (const channel of clip.channels) {
    hash.update(
      Buffer.from(channel.buffer, channel.byteOffset, channel.byteLength),
    );
    for (const sample of channel) peak = Math.max(peak, Math.abs(sample));
  }
  hash.update(String(clip.sampleRate));
  return {
    hash: hash.digest("hex"),
    frames: clip.channels[0]?.length ?? 0,
    peak,
  };
}

describe("offline master FX render (golden PCM)", () => {
  it("is deterministic and matches the golden digest", async () => {
    installWebAudioGlobals();
    const clip = fixtureClip();
    const first = await applyMasterFxOffline(clip, settings());
    const second = await applyMasterFxOffline(clip, settings());
    const a = digest(first);
    const b = digest(second);

    expect(a).toEqual(b);
    expect(a.frames).toBeGreaterThan(clip.channels[0]!.length);
    expect(a.peak).toBeGreaterThan(0);

    if (process.env.UPDATE_GOLDEN) {
      mkdirSync(goldenDir, { recursive: true });
      writeFileSync(goldenPath, `${JSON.stringify(a, null, 2)}\n`);
      return;
    }
    if (!existsSync(goldenPath)) {
      throw new Error(
        `Missing golden fixture ${goldenPath}. Run with UPDATE_GOLDEN=1 to create it.`,
      );
    }
    const golden = JSON.parse(readFileSync(goldenPath, "utf8"));
    expect(a.hash).toBe(golden.hash);
    expect(a.frames).toBe(golden.frames);
  }, 30_000);
});

describe("master FX downsample (GBA)", () => {
  it("defaults to off and round-trips through project JSON", () => {
    expect(defaultMasterFx().downsample).toEqual({
      enabled: false,
      rateHz: 11_025,
      lowpassEnabled: false,
      lowpassHz: 8000,
    });
    expect(
      masterFxFromJson({
        downsample: {
          enabled: true,
          rateHz: 9000,
          lowpassEnabled: true,
          lowpassHz: 6000,
        },
      }).downsample,
    ).toEqual({
      enabled: true,
      rateHz: 9000,
      lowpassEnabled: true,
      lowpassHz: 6000,
    });
  });

  it("applies an optional post low-pass", () => {
    const rate = 44_100;
    const frames = 8192;
    const data = new Float32Array(frames);
    for (let i = 0; i < frames; i++)
      data[i] = Math.sin((2 * Math.PI * 2000 * i) / rate);
    const clip = audioClip([data], rate);
    const dry = downsampleClip(clip, 11_025, { lowpassEnabled: false });
    const wet = downsampleClip(clip, 11_025, {
      lowpassEnabled: true,
      lowpassHz: 1000,
    });
    const rms = (c: Float32Array) =>
      Math.sqrt(c.reduce((sum, v) => sum + v * v, 0) / c.length);
    expect(rms(wet.channels[0]!)).toBeLessThan(rms(dry.channels[0]!));
  });

  it("holds samples at the target rate and is a no-op above it", () => {
    const data = new Float32Array(64);
    for (let i = 0; i < data.length; i++) data[i] = i % 2 ? -1 : 1;
    const clip = audioClip([data], 44_100);
    // 11025/44100 = 1/4, so the alternating wave becomes runs of four.
    const held = downsampleClip(clip, 11_025).channels[0]!;
    expect(new Set(held.slice(0, 4)).size).toBe(1);
    expect(new Set(held.slice(4, 8)).size).toBe(1);
    let flips = 0;
    for (let i = 1; i < held.length; i++)
      if (Math.sign(held[i]!) !== Math.sign(held[i - 1]!)) flips++;
    expect(flips).toBeLessThan(20);
    expect(downsampleClip(clip, 44_100)).toBe(clip);
  });

  it("loads the worklet processor and holds samples", async () => {
    installWebAudioGlobals();
    const rate = 44_100;
    const frames = 2048;
    const ctx = new OfflineAudioContext(1, frames, rate);
    await ctx.audioWorklet.addModule(DOWNSAMPLE_WORKLET_URL);
    const node = new AudioWorkletNode(ctx, DOWNSAMPLE_WORKLET_NAME, {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [1],
    });
    node.parameters.get("rateHz")!.value = 11_025;
    const buffer = ctx.createBuffer(1, frames, rate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frames; i++)
      data[i] = Math.sin((2 * Math.PI * 4000 * i) / rate);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(node);
    node.connect(ctx.destination);
    source.start(0);
    const out = (await ctx.startRendering()).getChannelData(0);
    // 11025/44100 = 1/4: each held value repeats four times.
    expect(out[1]).toBe(out[0]);
    expect(out[2]).toBe(out[0]);
    expect(out[4]).not.toBe(out[0]);
  }, 30_000);

  it("true-bypasses the realtime downsampler when disabled (BUG-39)", async () => {
    installWebAudioGlobals();
    const base = defaultMasterFx();
    const settings = {
      ...base,
      delay: { ...base.delay, enabled: false },
      reverb: { ...base.reverb, enabled: false },
      downsample: {
        enabled: false,
        rateHz: 11_025,
        lowpassEnabled: false,
        lowpassHz: 8000,
      },
    };
    const render = async (realtimeDownsample: boolean) => {
      const rate = 44_100;
      const frames = 2048;
      const ctx = new OfflineAudioContext(1, frames, rate);
      const graph = createMasterFxGraph(ctx, settings, { realtimeDownsample });
      const buffer = ctx.createBuffer(1, frames, rate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < frames; i++) data[i] = Math.sin(i / 8);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(graph.input);
      graph.output.connect(ctx.destination);
      source.start(0);
      const rendered = await ctx.startRendering();
      return Array.from(rendered.getChannelData(0));
    };
    // With the effect off, no ScriptProcessorNode is created, so the render is
    // byte-identical to a graph without the option at all.
    expect(await render(true)).toEqual(await render(false));
  }, 30_000);

  it("applies at the end of the offline render when enabled", async () => {
    installWebAudioGlobals();
    const base = defaultMasterFx();
    const settings = {
      ...base,
      delay: { ...base.delay, enabled: false },
      reverb: { ...base.reverb, enabled: false },
      downsample: {
        enabled: true,
        rateHz: 4_410,
        lowpassEnabled: false,
        lowpassHz: 8000,
      },
    };
    const out = await applyMasterFxOffline(fixtureClip(), settings);
    const data = out.channels[0]!;
    let changes = 0;
    for (let i = 1; i < data.length; i++)
      if (data[i] !== data[i - 1]) changes++;
    expect(changes).toBeLessThan(data.length / 5);
  }, 30_000);
});
