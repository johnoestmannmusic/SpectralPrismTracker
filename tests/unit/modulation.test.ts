import { describe, expect, it } from "vitest";
import {
  MOD_CONTROL_POINTS,
  SPECTRAL_PARAMS,
  defaultSpectralSettings,
  makeClip,
  sampleSpectralModulation,
  spectralParamIsModulated,
  type SpectralSettings,
} from "@/core/spectral";
import { makeSpectralRenderer, type PrismWasmModule } from "@/wasm/prism";
import {
  projectFromJson,
  projectToJson,
  projectFromValue,
  defaultProject,
} from "@/core/project";
import { defaultSamplerSettings } from "@/core/sampler";

const TUNE_A_INDEX = SPECTRAL_PARAMS.find((p) => p.id === "tuneA")!.index;

describe("spectral modulation sampling", () => {
  it("emits the base value everywhere and no mask when there are no routes", () => {
    const settings = defaultSpectralSettings();
    const { points, mask, numPoints } = sampleSpectralModulation(settings);
    expect(numPoints).toBe(MOD_CONTROL_POINTS);
    expect(mask).toBe(0);
    const tuneBase = settings.tune;
    for (let i = 0; i < MOD_CONTROL_POINTS; i++) {
      expect(points[TUNE_A_INDEX * MOD_CONTROL_POINTS + i]).toBeCloseTo(
        tuneBase,
        6,
      );
    }
  });

  it("sweeps the targeted parameter and sets its mask bit", () => {
    const settings = defaultSpectralSettings();
    settings.modulation = [
      {
        target: "tuneA",
        shape: "lfo",
        depth: 6,
        rateHz: 1,
        phase: 0,
        bipolar: true,
      },
    ];
    const { points, mask } = sampleSpectralModulation(settings);
    expect(mask & (1 << TUNE_A_INDEX)).toBeTruthy();
    const values = Array.from(
      { length: MOD_CONTROL_POINTS },
      (_, i) => points[TUNE_A_INDEX * MOD_CONTROL_POINTS + i]!,
    );
    const min = Math.min(...values);
    const max = Math.max(...values);
    expect(min).toBeLessThan(settings.tune - 1);
    expect(max).toBeGreaterThan(settings.tune + 1);
    expect(max - min).toBeLessThanOrEqual(12.01);
    // No other target is marked as modulated.
    expect(mask & ~(1 << TUNE_A_INDEX)).toBe(0);
  });

  it("unipolar routes only push upward and clamp to the parameter range", () => {
    const settings = defaultSpectralSettings();
    settings.tune = 20;
    settings.modulation = [
      {
        target: "tuneA",
        shape: "lfo",
        depth: 20,
        rateHz: 1,
        phase: 0,
        bipolar: false,
      },
    ];
    const { points } = sampleSpectralModulation(settings);
    for (let i = 0; i < MOD_CONTROL_POINTS; i++) {
      const v = points[TUNE_A_INDEX * MOD_CONTROL_POINTS + i]!;
      expect(v).toBeGreaterThanOrEqual(20 - 1e-6);
      expect(v).toBeLessThanOrEqual(24 + 1e-6);
    }
    expect(spectralParamIsModulated(settings, "tuneA")).toBe(true);
  });
});

describe("prism_dsp modulated adapter", () => {
  it("calls render_fused_modulated (not render_fused) when a route is present", () => {
    let plainCalls = 0;
    let modCalls = 0;
    let lastMask = -1;
    let lastPointsLength = -1;
    const wasm: PrismWasmModule = {
      render_fused() {
        plainCalls++;
        return {
          channelCount: 2,
          sampleRate: 44_100,
          data: Float32Array.from([0, 0]),
        };
      },
      render_fused_modulated(
        _a,
        _ac,
        _b,
        _bc,
        _sr,
        _fpA,
        _vA,
        _tA,
        _fA,
        _mode,
        _fpB,
        _fB,
        _vB,
        _tB,
        _mix,
        _cross,
        _conv,
        _ring,
        _width,
        _loop,
        points,
        _numPoints,
        mask,
      ) {
        modCalls++;
        lastMask = mask;
        lastPointsLength = points.length;
        return {
          channelCount: 2,
          sampleRate: 44_100,
          data: Float32Array.from([0.1, -0.1, 0.2, -0.2]),
        };
      },
    };
    const render = makeSpectralRenderer(wasm);
    const settings = defaultSpectralSettings();
    settings.mode = "mix";
    settings.modulation = [
      {
        target: "ringModAmount",
        shape: "ramp",
        depth: 50,
        rateHz: 1,
        phase: 0,
        bipolar: true,
      },
    ];
    const a = makeClip([[0, 0.5, 0, -0.5]], 44_100);
    const b = makeClip([[0.2, 0, -0.2, 0]], 44_100);
    const out = render(a, b, settings);
    expect(out.channels[0]!.length).toBe(2);
    expect(modCalls).toBe(1);
    expect(plainCalls).toBe(0);
    expect(lastPointsLength).toBe(SPECTRAL_PARAMS.length * MOD_CONTROL_POINTS);
    const ringIndex = SPECTRAL_PARAMS.find(
      (p) => p.id === "ringModAmount",
    )!.index;
    expect(lastMask & (1 << ringIndex)).toBeTruthy();
  });

  it("uses the plain render path when there is no modulation", () => {
    let plainCalls = 0;
    let modCalls = 0;
    const wasm: PrismWasmModule = {
      render_fused() {
        plainCalls++;
        return {
          channelCount: 1,
          sampleRate: 44_100,
          data: Float32Array.from([0.3, 0.2]),
        };
      },
      render_fused_modulated() {
        modCalls++;
        return {
          channelCount: 1,
          sampleRate: 44_100,
          data: Float32Array.from([0, 0]),
        };
      },
    };
    const render = makeSpectralRenderer(wasm);
    const settings = defaultSpectralSettings();
    settings.mode = "off";
    const out = render(makeClip([[0, 1, 0, -1]], 44_100), null, settings);
    expect(out.channels[0]!.length).toBe(2);
    expect(plainCalls).toBe(1);
    expect(modCalls).toBe(0);
  });
});

describe("modulation project JSON", () => {
  it("round-trips modulation routes", () => {
    const project = defaultProject();
    const settings = defaultSamplerSettings();
    settings.spectral.enabled = true;
    settings.spectral.mode = "mix";
    settings.spectral.modulation = [
      {
        target: "freezePointA",
        shape: "lfo",
        depth: 25,
        rateHz: 0.5,
        phase: 0.25,
        bipolar: true,
      },
      {
        target: "ringModAmount",
        shape: "ramp",
        depth: 80,
        rateHz: 2,
        phase: 0,
        bipolar: false,
      },
    ];
    project.instruments = [settings];
    const reread = projectFromJson(projectToJson(project));
    expect(reread.instruments[0]!.spectral.modulation).toHaveLength(2);
    expect(reread.instruments[0]!.spectral.modulation[0]).toEqual({
      target: "freezePointA",
      shape: "lfo",
      depth: 25,
      rateHz: 0.5,
      phase: 0.25,
      bipolar: true,
    });
    expect(reread.instruments[0]!.spectral.modulation[1]!.bipolar).toBe(false);
  });

  it("drops unknown targets and defaults a missing field to empty", () => {
    const value = defaultProject() as unknown as Record<string, unknown>;
    value.instruments = [
      {
        spectral: {
          mode: "off",
          modulation: [
            { target: "notARealParam", shape: "lfo", depth: 5 },
            { target: "tuneA", shape: "bogus", depth: 3 },
          ],
        },
      },
    ];
    const project = projectFromValue(value);
    const routes = project.instruments[0]!.spectral.modulation;
    expect(routes).toHaveLength(1);
    expect(routes[0]!.target).toBe("tuneA");
    expect(routes[0]!.shape).toBe("lfo");

    const noField = defaultSpectralSettings();
    expect(noField.modulation).toEqual([]);
  });
});
