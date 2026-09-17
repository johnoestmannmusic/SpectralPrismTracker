import { beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  initSync,
  render_fused,
  render_fused_loop_lengths,
} from "@/renderer/vendor/prism/prism_wasm.js";
import { makeSpectralRenderer, type PrismWasmModule } from "@/wasm/prism";
import {
  MOD_CONTROL_POINTS,
  SPECTRAL_PARAMS,
  defaultSpectralSettings,
  sampleSpectralModulation,
} from "@/core/spectral";
import { projectFromJson, projectToJson, defaultProject } from "@/core/project";
import { defaultSamplerSettings } from "@/core/sampler";
import { projectPath } from "./fixtures";

const LOOP_LENGTH_INDEX = SPECTRAL_PARAMS.find(
  (p) => p.id === "loopLength",
)!.index;

beforeAll(() => {
  const bytes = readFileSync(
    projectPath("src/renderer/vendor/prism/prism_wasm_bg.wasm"),
  );
  initSync({ module: bytes });
});

describe("loop-length modulation routing", () => {
  it("uses the loop-length render path when a loopLength route is active", () => {
    let structuralCalls = 0;
    let modulatedCalls = 0;
    let lastMask = 0;
    const wasm = {
      render_fused() {
        throw new Error("plain render should not be used");
      },
      render_fused_modulated() {
        modulatedCalls++;
        return {
          channelCount: 1,
          sampleRate: 44_100,
          data: Float32Array.from([0, 0]),
        };
      },
      render_fused_loop_lengths(
        _a: unknown,
        _ac: unknown,
        _b: unknown,
        _bc: unknown,
        _sr: unknown,
        _fpA: unknown,
        _vA: unknown,
        _tA: unknown,
        _fA: unknown,
        _mode: unknown,
        _fpB: unknown,
        _fB: unknown,
        _vB: unknown,
        _tB: unknown,
        _mix: unknown,
        _cross: unknown,
        _conv: unknown,
        _ring: unknown,
        _width: unknown,
        _loop: unknown,
        _tracks: unknown,
        _numPoints: unknown,
        _mask: unknown,
        _segments: unknown,
        _crossfade: unknown,
      ) {
        structuralCalls++;
        lastMask = _mask as number;
        return {
          channelCount: 1,
          sampleRate: 44_100,
          data: Float32Array.from([0.2, -0.2, 0.1]),
        };
      },
    } as unknown as PrismWasmModule;

    const settings = defaultSpectralSettings();
    settings.mode = "off";
    settings.modulation = [
      {
        target: "loopLength",
        shape: "ramp",
        depth: 1,
        rateHz: 1,
        phase: 0,
        bipolar: true,
      },
    ];
    const render = makeSpectralRenderer(wasm);
    const out = render(
      { channels: [Float32Array.from([0, 0.5, 0, -0.5])], sampleRate: 44_100 },
      null,
      settings,
    );
    expect(structuralCalls).toBe(1);
    expect(modulatedCalls).toBe(0);
    expect(lastMask & (1 << LOOP_LENGTH_INDEX)).toBeTruthy();
    expect(out.channels[0]!.length).toBe(3);
  });

  it("goes back to the modulated path when only non-structural targets are set", () => {
    let structuralCalls = 0;
    let modulatedCalls = 0;
    const wasm = {
      render_fused_modulated() {
        modulatedCalls++;
        return {
          channelCount: 1,
          sampleRate: 44_100,
          data: Float32Array.from([0.1]),
        };
      },
      render_fused_loop_lengths() {
        structuralCalls++;
        return {
          channelCount: 1,
          sampleRate: 44_100,
          data: Float32Array.from([0.1]),
        };
      },
    } as unknown as PrismWasmModule;
    const settings = defaultSpectralSettings();
    settings.mode = "off";
    settings.modulation = [
      {
        target: "tuneA",
        shape: "lfo",
        depth: 3,
        rateHz: 1,
        phase: 0,
        bipolar: true,
      },
    ];
    makeSpectralRenderer(wasm)(
      { channels: [Float32Array.from([0, 1, 0, -1])], sampleRate: 44_100 },
      null,
      settings,
    );
    expect(structuralCalls).toBe(0);
    expect(modulatedCalls).toBe(1);
  });
});

describe("loop-length modulation (real engine)", () => {
  it("preserves the base length and changes the rendered loop", () => {
    const rate = 44_100;
    const data = Float32Array.from(
      { length: rate },
      (_, i) => Math.sin((2 * Math.PI * 220 * i) / rate) * 0.5,
    );
    const base = defaultSpectralSettings();
    base.mode = "off";
    base.loopLengthSeconds = 1;

    const modulated = defaultSpectralSettings();
    modulated.mode = "off";
    modulated.loopLengthSeconds = 1;
    modulated.modulation = [
      {
        target: "loopLength",
        shape: "lfo",
        depth: 0.35,
        rateHz: 1,
        phase: 0,
        bipolar: true,
      },
    ];

    const wasm = {
      render_fused,
      render_fused_loop_lengths,
    } as unknown as PrismWasmModule;
    const render = makeSpectralRenderer(wasm);
    const source = { channels: [data], sampleRate: rate };
    const baseClip = render(source, null, base);
    const modClip = render(source, null, modulated);

    expect(modClip.channels[0]!.length).toBe(baseClip.channels[0]!.length);
    expect(
      Array.from(modClip.channels.flatMap((c) => Array.from(c))).every(
        Number.isFinite,
      ),
    ).toBe(true);
    const diff: number = Array.from(modClip.channels[0]!).reduce(
      (sum, v, i) => sum + (v - baseClip.channels[0]![i]!) ** 2,
      0,
    );
    expect(diff).toBeGreaterThan(1e-6);
    expect(
      sampleSpectralModulation(modulated).mask & (1 << LOOP_LENGTH_INDEX),
    ).toBeTruthy();
  });
});

describe("loop-length route JSON", () => {
  it("round-trips a loopLength route", () => {
    const project = defaultProject();
    const settings = defaultSamplerSettings();
    settings.spectral.enabled = true;
    settings.spectral.modulation = [
      {
        target: "loopLength",
        shape: "random",
        depth: 0.5,
        rateHz: 0.5,
        phase: 0.1,
        bipolar: false,
      },
    ];
    project.instruments = [settings];
    const reread = projectFromJson(projectToJson(project));
    expect(reread.instruments[0]!.spectral.modulation[0]).toEqual({
      target: "loopLength",
      shape: "random",
      depth: 0.5,
      rateHz: 0.5,
      phase: 0.1,
      bipolar: false,
    });
    expect(MOD_CONTROL_POINTS).toBe(128);
  });
});
