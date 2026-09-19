import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { applyMasterFxOffline } from "@/audio/offline";
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
    });
    expect(
      masterFxFromJson({ downsample: { enabled: true, rateHz: 9000 } })
        .downsample,
    ).toEqual({ enabled: true, rateHz: 9000 });
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

  it("applies at the end of the offline render when enabled", async () => {
    installWebAudioGlobals();
    const base = defaultMasterFx();
    const settings = {
      ...base,
      delay: { ...base.delay, enabled: false },
      reverb: { ...base.reverb, enabled: false },
      downsample: { enabled: true, rateHz: 4_410 },
    };
    const out = await applyMasterFxOffline(fixtureClip(), settings);
    const data = out.channels[0]!;
    let changes = 0;
    for (let i = 1; i < data.length; i++)
      if (data[i] !== data[i - 1]) changes++;
    expect(changes).toBeLessThan(data.length / 5);
  }, 30_000);
});
