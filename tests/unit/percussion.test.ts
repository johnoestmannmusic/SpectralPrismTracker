import { beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  initSync,
  render_fused,
  render_percussion,
} from "@/renderer/vendor/prism/prism_wasm.js";
import { makeSpectralRenderer, type PrismWasmModule } from "@/wasm/prism";
import { defaultSpectralSettings, percussionPreset } from "@/core/spectral";
import {
  defaultProject,
  projectFromJson,
  projectFromValue,
  projectToJson,
} from "@/core/project";
import { defaultSamplerSettings } from "@/core/sampler";
import { projectPath } from "./fixtures";

beforeAll(() => {
  const bytes = readFileSync(
    projectPath("src/renderer/vendor/prism/prism_wasm_bg.wasm"),
  );
  initSync({ module: bytes });
});

describe("percussion post-stage routing", () => {
  const rate = 44_100;
  const sine = Float32Array.from(
    { length: rate / 2 },
    (_, i) => Math.sin((2 * Math.PI * 220 * i) / rate) * 0.5,
  );

  it("is skipped when disabled and applied when enabled", () => {
    let percussionCalls = 0;
    const wasm = {
      render_fused() {
        return {
          channelCount: 2,
          sampleRate: rate,
          data: Float32Array.from([0.5, 0.5, -0.5, -0.5]),
        };
      },
      render_percussion() {
        percussionCalls++;
        return {
          channelCount: 1,
          sampleRate: rate,
          data: Float32Array.from([1, 0.5]),
        };
      },
    } as unknown as PrismWasmModule;
    const render = makeSpectralRenderer(wasm);

    const off = defaultSpectralSettings();
    off.mode = "off";
    render({ channels: [sine], sampleRate: rate }, null, off);
    expect(percussionCalls).toBe(0);

    const on = defaultSpectralSettings();
    on.mode = "off";
    on.percussion = percussionPreset("kick");
    const out = render({ channels: [sine], sampleRate: rate }, null, on);
    expect(percussionCalls).toBe(1);
    // Output is the short percussion buffer, not the fused one.
    expect(out.channels[0]!.length).toBe(2);
  });

  it("renders the real engine's fused output as a shorter one-shot", () => {
    const fused = defaultSpectralSettings();
    fused.mode = "off";
    fused.loopLengthSeconds = 1;
    const percussion = defaultSpectralSettings();
    percussion.mode = "off";
    percussion.loopLengthSeconds = 1;
    percussion.percussion = percussionPreset("kick");
    percussion.percussion.lengthSeconds = 0.4;

    const wasm = {
      render_fused,
      render_percussion,
    } as unknown as PrismWasmModule;
    const render = makeSpectralRenderer(wasm);
    const source = { channels: [sine], sampleRate: rate };
    const loop = render(source, null, fused);
    const hit = render(source, null, percussion);

    expect(
      Array.from(hit.channels.flatMap((c) => Array.from(c))).every(
        Number.isFinite,
      ),
    ).toBe(true);
    const loopDuration = loop.channels[0]!.length / loop.sampleRate;
    const hitDuration = hit.channels[0]!.length / hit.sampleRate;
    expect(Math.abs(loopDuration - 1)).toBeLessThan(0.05);
    expect(Math.abs(hitDuration - 0.4)).toBeLessThan(0.02);
    expect(hitDuration).toBeLessThan(loopDuration);
  });

  it("applies drive and compression through the real engine", () => {
    const settings = defaultSpectralSettings();
    settings.mode = "off";
    settings.loopLengthSeconds = 1;
    settings.percussion = {
      ...percussionPreset("kick"),
      driveAmount: 100,
      compressAmount: 100,
    };
    const wasm = {
      render_fused,
      render_percussion,
    } as unknown as PrismWasmModule;
    const render = makeSpectralRenderer(wasm);
    const hit = render({ channels: [sine], sampleRate: rate }, null, settings);
    const samples = hit.channels.flatMap((c) => Array.from(c));
    expect(samples.every(Number.isFinite)).toBe(true);
    const peak = samples.reduce((m, s) => Math.max(m, Math.abs(s)), 0);
    expect(peak).toBeGreaterThan(0.5);
    expect(peak).toBeLessThanOrEqual(1.0001);
  });
});

describe("percussion project JSON", () => {
  it("round-trips percussion params and the one-shot flag", () => {
    const project = defaultProject();
    const settings = defaultSamplerSettings();
    settings.spectral.enabled = true;
    settings.spectral.mode = "ring-modulate";
    settings.spectral.percussion = {
      ...percussionPreset("snare"),
      noiseAmount: 42,
      driveAmount: 33,
      compressAmount: 55,
    };
    settings.spectral.oneShot = true;
    project.instruments = [settings];

    const reread = projectFromJson(projectToJson(project));
    const percussion = reread.instruments[0]!.spectral.percussion;
    expect(percussion.enabled).toBe(true);
    expect(percussion.noiseAmount).toBe(42);
    expect(percussion.noiseColor).toBe("white");
    expect(percussion.driveAmount).toBe(33);
    expect(percussion.compressAmount).toBe(55);
    expect(percussion.lengthSeconds).toBeCloseTo(0.4, 6);
    expect(reread.instruments[0]!.spectral.oneShot).toBe(true);
  });

  it("defaults drive and compression off so legacy renders are unchanged", () => {
    for (const preset of ["kick", "snare", "metal", "hat"] as const) {
      const settings = percussionPreset(preset);
      expect(settings.driveAmount).toBe(0);
      expect(settings.compressAmount).toBe(0);
    }
    expect(defaultSpectralSettings().percussion.driveAmount).toBe(0);
    expect(defaultSpectralSettings().percussion.compressAmount).toBe(0);
  });

  it("defaults a legacy project to disabled percussion and looping", () => {
    const value = defaultProject() as unknown as Record<string, unknown>;
    value.instruments = [{ spectral: { mode: "off" } }];
    const project = projectFromValue(value);
    const spectral = project.instruments[0]!.spectral;
    expect(spectral.percussion.enabled).toBe(false);
    expect(spectral.oneShot).toBe(false);
  });
});
