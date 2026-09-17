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
import { installWebAudioGlobals } from "@/runtime/audio";

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

  it("does not reuse the fused loop once Spectral is disabled", () => {
    setSpectralWasmAvailable(true);
    try {
      const sampler = new SamplerEngine();
      const ctx = fakeAudioContext();
      const makeBuffer = () =>
        ({
          duration: 4,
          numberOfChannels: 1,
          sampleRate: 44_100,
          getChannelData: () => new Float32Array(4 * 44_100),
        }) as unknown as AudioBuffer;
      sampler.samples = [makeBuffer()];
      sampler.fused = [makeBuffer()];
      const settings = defaultSamplerSettings();
      settings.sourceIndex = 0;
      settings.looping = true;
      settings.startSec = 0;
      settings.endSec = 4;
      settings.spectral = {
        ...defaultSpectralSettings(),
        enabled: true,
        mode: "off",
      };
      sampler.settings = [settings];

      const fusedLoop = sampler.buffer(ctx, 0);
      settings.spectral.enabled = false;
      const rawLoop = sampler.buffer(ctx, 0);
      expect(rawLoop).not.toBe(fusedLoop);
    } finally {
      setSpectralWasmAvailable(false);
    }
  });
});

describe("Voice.release envelope", () => {
  it("preserves the decay instead of jumping back to full level", async () => {
    installWebAudioGlobals();
    const sr = 44_100;
    const ctx = new OfflineAudioContext(2, sr, sr);
    const buffer = ctx.createBuffer(1, sr, sr);
    buffer.getChannelData(0).fill(1);

    const settings = defaultSamplerSettings();
    settings.sourceIndex = 0;
    settings.attack = 0.005;
    settings.decay = 0.83;
    settings.sustain = 0;
    settings.release = 0.15;
    settings.looping = true;
    settings.pan = -1; // full left, so channel 0 is the raw envelope

    const voice = buildVoice(
      ctx,
      buffer,
      settings,
      0,
      0,
      1,
      1,
      0,
      ctx.destination,
    );
    // Scheduler lookahead releases the voice ahead of the next note.
    voice.release(0.6, 0.008);

    const out = await ctx.startRendering();
    const d = out.getChannelData(0);
    const at = (t: number) => d[Math.floor(t * sr)]!;
    // Original ADSR decay: 1 at 0.005s down to 0 at 0.835s.
    expect(at(0.3)).toBeCloseTo(0.645, 2);
    expect(at(0.5)).toBeCloseTo(0.404, 2);
    // Holds the value at the release time, then fades out.
    expect(at(0.6)).toBeCloseTo(0.283, 2);
    expect(at(0.62)).toBeCloseTo(0, 2);
  });
});
