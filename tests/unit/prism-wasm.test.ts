import { beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  initSync,
  render_fused,
  render_fused_modulated,
  render_microtextures,
} from "@/wasm/vendor/prism/prism_wasm.js";
import { makeSpectralRenderer, type PrismWasmModule } from "@/wasm/prism";
import { initPrismWasmNode } from "@/wasm/prismNode";
import { SamplerEngine } from "@/audio/webSampler";
import {
  defaultSpectralSettings,
  sampleSpectralModulation,
  spectralRender,
} from "@/core/spectral";
import { projectPath } from "./fixtures";

beforeAll(() => {
  const bytes = readFileSync(
    projectPath("src/wasm/vendor/prism/prism_wasm_bg.wasm"),
  );
  initSync({ module: bytes });
});

describe("prism_dsp WASM (real engine)", () => {
  it("freezes a sine into a finite stereo loop", () => {
    const rate = 44_100;
    const data = Float32Array.from(
      { length: rate },
      (_, i) => Math.sin((2 * Math.PI * 220 * i) / rate) * 0.5,
    );
    const settings = defaultSpectralSettings();
    settings.mode = "off";
    settings.loopLengthSeconds = 1;

    const wasm = { render_fused } as unknown as PrismWasmModule;
    const clip = makeSpectralRenderer(wasm)(
      { channels: [data], sampleRate: rate },
      null,
      settings,
    );

    expect(clip.channels.length).toBe(2);
    const duration = clip.channels[0]!.length / clip.sampleRate;
    expect(Math.abs(duration - 1)).toBeLessThan(0.05);
    expect(Array.from(clip.channels[0]!).every(Number.isFinite)).toBe(true);
    expect(
      Array.from(clip.channels.flatMap((c) => Array.from(c))).some(
        (v) => Math.abs(v) > 1e-6,
      ),
    ).toBe(true);
  });

  it("cross-synthesises two samples without non-finite output", () => {
    const rate = 44_100;
    const tone = (freq: number) =>
      Float32Array.from(
        { length: rate / 2 },
        (_, i) => Math.sin((2 * Math.PI * freq * i) / rate) * 0.5,
      );
    const settings = defaultSpectralSettings();
    settings.mode = "cross-synth";
    settings.sourceIndex2 = 1;
    settings.loopLengthSeconds = 0.5;

    const wasm = { render_fused } as unknown as PrismWasmModule;
    const clip = makeSpectralRenderer(wasm)(
      { channels: [tone(220)], sampleRate: rate },
      { channels: [tone(330)], sampleRate: rate },
      settings,
    );
    expect(
      Array.from(clip.channels.flatMap((c) => Array.from(c))).every(
        Number.isFinite,
      ),
    ).toBe(true);
  });

  it("bakes a parameter modulation route into the result", () => {
    const rate = 44_100;
    const data = Float32Array.from(
      { length: rate },
      (_, i) => Math.sin((2 * Math.PI * 220 * i) / rate) * 0.5,
    );
    const plain = defaultSpectralSettings();
    plain.mode = "off";
    plain.loopLengthSeconds = 1;

    const modulated = defaultSpectralSettings();
    modulated.mode = "off";
    modulated.loopLengthSeconds = 1;
    modulated.modulation = [
      {
        target: "tuneA",
        shape: "lfo",
        depth: 5,
        rateHz: 1,
        phase: 0,
        bipolar: true,
      },
    ];

    const wasm = {
      render_fused,
      render_fused_modulated,
    } as unknown as PrismWasmModule;
    const render = makeSpectralRenderer(wasm);
    const plainClip = render(
      { channels: [data], sampleRate: rate },
      null,
      plain,
    );
    const modClip = render(
      { channels: [data], sampleRate: rate },
      null,
      modulated,
    );

    expect(
      Array.from(modClip.channels.flatMap((c) => Array.from(c))).every(
        Number.isFinite,
      ),
    ).toBe(true);
    const diff: number = Array.from(modClip.channels[0]!).reduce(
      (sum, v, i) => sum + (v - plainClip.channels[0]![i]!) ** 2,
      0,
    );
    expect(diff).toBeGreaterThan(1e-6);
    expect(sampleSpectralModulation(modulated).mask).not.toBe(0);
  });

  it("applies the MicroTextures granular stage via WASM", () => {
    const rate = 44_100;
    const data = Float32Array.from(
      { length: rate },
      (_, i) => Math.sin((2 * Math.PI * 220 * i) / rate) * 0.5,
    );
    const settings = defaultSpectralSettings();
    settings.mode = "off";
    settings.loopLengthSeconds = 1;
    settings.microTextures.enabled = true;

    const wasm = {
      render_fused,
      render_microtextures,
    } as unknown as PrismWasmModule;
    const clip = makeSpectralRenderer(wasm)(
      { channels: [data], sampleRate: rate },
      null,
      settings,
    );
    expect(clip.channels.length).toBe(2);
    expect(
      Array.from(clip.channels.flatMap((c) => Array.from(c))).every(
        Number.isFinite,
      ),
    ).toBe(true);
    expect(Array.from(clip.channels[0]!).some((v) => Math.abs(v) > 1e-6)).toBe(
      true,
    );
  });

  it("applies microtextures through the registered node-host renderer", async () => {
    expect(initPrismWasmNode()).toBe(true);
    const rate = 44_100;
    const a = {
      channels: [
        Float32Array.from(
          { length: rate },
          (_, i) => Math.sin((2 * Math.PI * 220 * i) / rate) * 0.5,
        ),
      ],
      sampleRate: rate,
    };
    const plain = defaultSpectralSettings();
    plain.mode = "off";
    plain.loopLengthSeconds = 1;
    const textured = defaultSpectralSettings();
    textured.mode = "off";
    textured.loopLengthSeconds = 1;
    textured.microTextures.enabled = true;

    const base = await spectralRender(a, null, plain);
    const result = await spectralRender(a, null, textured);
    const diff = Array.from(result.channels[0]!).reduce(
      (sum, value, index) => sum + (value - base.channels[0]![index]!) ** 2,
      0,
    );
    expect(diff).toBeGreaterThan(1e-6);
  });

  it("clears baked renders when the instrument list changes", () => {
    const engine = new SamplerEngine();
    engine.fused = [null, null];
    engine.fusedClips = [null, null];
    engine.fusedWaveforms = [[], []];
    engine.loops = [null, null];
    engine.resetRenders();
    expect(engine.fused).toHaveLength(0);
    expect(engine.fusedClips).toHaveLength(0);
    expect(engine.loops).toHaveLength(0);
  });
});
