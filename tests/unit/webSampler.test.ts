import { afterEach, describe, expect, it } from "vitest";
import { SamplerEngine, buildVoice } from "@/audio/webSampler";
import {
  defaultSpectralSettings,
  makeClip,
  registerSpectralRenderer,
  setSpectralWasmAvailable,
  type SpectralRenderFn,
} from "@/core/spectral";
import { defaultSamplerSettings } from "@/core/sampler";
import type { AudioClip } from "@/core/dsp";

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function fakeAudioContext(): AudioContext {
  return {
    createBuffer(channelCount: number, length: number) {
      const channels = Array.from(
        { length: channelCount },
        () => new Float32Array(length),
      );
      return {
        duration: length / 44_100,
        getChannelData: (c: number) => channels[c]!,
      };
    },
  } as unknown as AudioContext;
}

interface GainCall {
  type: "set" | "ramp";
  value: number;
  time: number;
}

/** Minimal AudioContext that records the voice gain node's automation. */
function recordingAudioContext(): { ctx: AudioContext; gainCalls: GainCall[] } {
  const gainCalls: GainCall[] = [];
  const gainParam = () => ({
    value: 0,
    setValueAtTime(value: number, time: number) {
      gainCalls.push({ type: "set", value, time });
    },
    linearRampToValueAtTime(value: number, time: number) {
      gainCalls.push({ type: "ramp", value, time });
    },
    cancelScheduledValues() {},
  });
  const ctx = {
    destination: {},
    createBufferSource() {
      return {
        buffer: null,
        playbackRate: {
          value: 1,
          setValueAtTime() {},
          linearRampToValueAtTime() {},
        },
        detune: { value: 0 },
        loop: false,
        loopStart: 0,
        loopEnd: 0,
        connect() {},
        disconnect() {},
        start() {},
        stop() {},
      };
    },
    createGain() {
      return { gain: gainParam(), connect() {}, disconnect() {} };
    },
    createStereoPanner() {
      return { pan: { value: 0 }, connect() {}, disconnect() {} };
    },
    createOscillator() {
      return {
        type: "sine",
        frequency: { value: 0 },
        detune: { value: 0 },
        connect() {},
        disconnect() {},
        start() {},
        stop() {},
      };
    },
  };
  return { ctx: ctx as unknown as AudioContext, gainCalls };
}

afterEach(() => {
  registerSpectralRenderer(null);
  setSpectralWasmAvailable(false);
});

describe("SamplerEngine.renderSpectral", () => {
  it("discards a stale render superseded by a newer one for the same instrument", async () => {
    const pending: Array<{ resolve: (clip: AudioClip) => void }> = [];
    const renderer: SpectralRenderFn = () => {
      const d = deferred<AudioClip>();
      pending.push(d);
      return d.promise;
    };
    registerSpectralRenderer(renderer);
    setSpectralWasmAvailable(true);

    const engine = new SamplerEngine();
    const settings = defaultSamplerSettings();
    settings.sourceIndex = 0;
    settings.spectral = {
      ...defaultSpectralSettings(),
      enabled: true,
      mode: "off",
    };
    engine.settings = [settings];
    engine.clips = [makeClip([[1, 2, 3]], 44_100)];

    const ctx = fakeAudioContext();
    const first = engine.renderSpectral(ctx, 0);
    expect(engine.rendering[0]).toBe(true);
    const second = engine.renderSpectral(ctx, 0);
    expect(engine.rendering[0]).toBe(true);
    expect(pending).toHaveLength(2);

    const clipA = makeClip([[0.1]], 44_100);
    const clipB = makeClip([[0.9]], 44_100);

    // Resolve the first (now-stale) render before the second: its result must be discarded.
    pending[0]!.resolve(clipA);
    await first;
    expect(engine.fusedClips[0]).toBeNull();
    expect(engine.rendering[0]).toBe(true); // the second render is still in flight

    pending[1]!.resolve(clipB);
    await second;
    expect(engine.fusedClips[0]).toBe(clipB);
    expect(engine.rendering[0]).toBe(false);
    expect(engine.takeFusionCompleted(0)).toBe(true);
    expect(engine.takeFusionCompleted(0)).toBe(false); // one-shot: cleared after being read
  });

  it("honours the Spectral one-shot flag instead of always force-looping", async () => {
    const renderer: SpectralRenderFn = async () =>
      makeClip([[0.1, -0.1, 0.1, -0.1]], 44_100);
    registerSpectralRenderer(renderer);
    setSpectralWasmAvailable(true);
    const ctx = fakeAudioContext();

    const looped = defaultSamplerSettings();
    looped.sourceIndex = 0;
    looped.spectral = {
      ...defaultSpectralSettings(),
      enabled: true,
      mode: "off",
    };
    const engineA = new SamplerEngine();
    engineA.settings = [looped];
    engineA.clips = [makeClip([[1, 2, 3]], 44_100)];
    await engineA.renderSpectral(ctx, 0);
    expect(looped.looping).toBe(true);
    expect(looped.startSec).toBe(0);

    const oneShot = defaultSamplerSettings();
    oneShot.sourceIndex = 0;
    oneShot.spectral = {
      ...defaultSpectralSettings(),
      enabled: true,
      mode: "off",
      oneShot: true,
    };
    const engineB = new SamplerEngine();
    engineB.settings = [oneShot];
    engineB.clips = [makeClip([[1, 2, 3]], 44_100)];
    await engineB.renderSpectral(ctx, 0);
    expect(oneShot.looping).toBe(false);
    expect(oneShot.endSec).toBeGreaterThan(0);
  });
});

describe("buildVoice one-shot Spectral envelope", () => {
  function settingsWithAttack(attack: number, oneShot: boolean) {
    const s = defaultSamplerSettings();
    s.sourceIndex = 0;
    s.endSec = 0.5;
    s.attack = attack;
    s.decay = 2;
    s.sustain = 0.4;
    s.spectral = {
      ...defaultSpectralSettings(),
      enabled: true,
      mode: "off",
      oneShot,
    };
    return s;
  }

  it("bypasses a long instrument attack for a one-shot Spectral voice", () => {
    const { ctx, gainCalls } = recordingAudioContext();
    const settings = settingsWithAttack(0.338, true);
    buildVoice(
      ctx,
      { duration: 0.5 } as AudioBuffer,
      settings,
      0,
      0,
      1,
      1,
      10,
      ctx.destination,
    );

    // Reaches full level almost immediately rather than ramping over 0.338s.
    const firstRamp = gainCalls.find((c) => c.type === "ramp");
    expect(firstRamp).toMatchObject({ value: 1, time: 10.003 });
    // Sustain is 1, so the second ramp holds full level.
    const secondRamp = gainCalls.filter((c) => c.type === "ramp")[1];
    expect(secondRamp).toMatchObject({ value: 1, time: 10.003 });
  });

  it("keeps the instrument ADSR for looped Spectral voices", () => {
    const { ctx, gainCalls } = recordingAudioContext();
    const settings = settingsWithAttack(0.338, false);
    buildVoice(
      ctx,
      { duration: 0.5 } as AudioBuffer,
      settings,
      0,
      0,
      1,
      1,
      10,
      ctx.destination,
    );

    const firstRamp = gainCalls.find((c) => c.type === "ramp");
    expect(firstRamp).toMatchObject({ value: 1, time: 10.338 });
    const secondRamp = gainCalls.filter((c) => c.type === "ramp")[1];
    expect(secondRamp).toMatchObject({ value: 0.4, time: 12.338 });
  });
});
