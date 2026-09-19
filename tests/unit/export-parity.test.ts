import { describe, expect, it } from "vitest";
import { installWebAudioGlobals } from "@/runtime/audio";
import { defaultSamplerSettings, sequenceFromSong } from "@/core/sampler";
import type { SamplerSettings } from "@/core/sampler";
import { renderSamplerMix } from "@/core/export";
import { buildVoice } from "@/audio/webSampler";
import { makeClip } from "@/core/spectral";
import { defaultMasterFx } from "@/core/masterFx";
import { exportWav } from "@/tui/io";
import type { Session } from "@/tui/session";
import { fixtureSong } from "./fixtures";

const RATE = 44_100;

/** Constant stereo clip: left 0.5, right 0.25. */
function stereoClip() {
  const frames = 4410; // 0.1 s
  const left = new Array<number>(frames).fill(0.5);
  const right = new Array<number>(frames).fill(0.25);
  return makeClip([left, right], RATE);
}

function noteSettings(pan: number, panRandomRange = 0): SamplerSettings {
  const s = defaultSamplerSettings();
  s.sourceIndex = 0;
  s.startSec = 0;
  s.endSec = 0.1;
  s.attack = 0.003;
  s.decay = 0;
  s.sustain = 1;
  s.pan = pan;
  s.panRandomRange = panRandomRange;
  return s;
}

describe("stereo pan law parity (live vs export)", () => {
  it("matches StereoPannerNode for a stereo source at every pan", async () => {
    installWebAudioGlobals();
    for (const pan of [-1, -0.5, 0, 0.5, 1]) {
      const clip = stereoClip();
      const settings = noteSettings(pan);
      const seq = {
        tuning: 440,
        rows: [
          [
            {
              type: "note" as const,
              channel: 0,
              instrument: 0,
              rate: 1,
              volume: 1,
            },
          ],
        ],
        rowTimes: [0, 1],
      };
      const offline = renderSamplerMix(
        seq,
        [settings],
        [clip],
        [1, 1, 1, 1],
        [false, false, false, false],
        1,
      );
      // Read well inside the region so the edge fade is 1.
      const at = Math.floor(0.05 * RATE);
      const offL = offline.channels[0]![at]!;
      const offR = offline.channels[1]![at]!;

      const ctx = new OfflineAudioContext(2, RATE, RATE);
      const buffer = ctx.createBuffer(2, clip.channels[0]!.length, RATE);
      clip.channels.forEach((c, i) => buffer.getChannelData(i).set(c));
      buildVoice(ctx, buffer, settings, 0, 0, 1, 1, 0, ctx.destination);
      const live = await ctx.startRendering();
      const liveL = live.getChannelData(0)[at]!;
      const liveR = live.getChannelData(1)[at]!;

      expect(offL).toBeCloseTo(liveL, 5);
      expect(offR).toBeCloseTo(liveR, 5);
      // Sanity: the measured WebAudio law folds opposite-channel content.
      if (pan === -1) expect(offL).toBeCloseTo(0.75, 5);
      if (pan === 1) expect(offR).toBeCloseTo(0.75, 5);
    }
  }, 30_000);
});

describe("baked pan spread", () => {
  it("bakes a deterministic panRandom per note in the sequence", () => {
    const song = fixtureSong();
    const settings = song.instruments.map(() => noteSettings(0, 0.5));
    const first = sequenceFromSong(song, settings);
    const second = sequenceFromSong(song, settings);
    let notes = 0;
    for (let row = 0; row < first.rows.length; row++) {
      const a = first.rows[row] ?? [];
      const b = second.rows[row] ?? [];
      for (let i = 0; i < a.length; i++) {
        const ea = a[i]!;
        const eb = b[i]!;
        if (ea.type !== "note" || eb.type !== "note") continue;
        notes++;
        expect(ea.panRandom).toBe(eb.panRandom);
        expect(ea.panRandom).toBeGreaterThanOrEqual(-0.5);
        expect(ea.panRandom).toBeLessThanOrEqual(0.5);
      }
    }
    expect(notes).toBeGreaterThan(0);
  });

  it("leaves panRandom at 0 when the instrument has no spread", () => {
    const song = fixtureSong();
    const settings = song.instruments.map(() => noteSettings(0, 0));
    const seq = sequenceFromSong(song, settings);
    const note = seq.rows.flat().find((event) => event.type === "note");
    expect(note && note.type === "note" ? note.panRandom : undefined).toBe(0);
  });
});

describe("WAV export length", () => {
  it("trims the master-FX tail to the arranged song length", async () => {
    installWebAudioGlobals();
    const song = fixtureSong();
    const clip = stereoClip();
    const settings = song.instruments.map(() => noteSettings(0, 0));
    const masterFx = defaultMasterFx();
    masterFx.delay = {
      ...masterFx.delay,
      enabled: true,
      timeSec: 0.1,
      feedback: 0.4,
      mix: 0.5,
    };
    // Reverb off so the test is deterministic.
    masterFx.reverb = { ...masterFx.reverb, enabled: false, mix: 0 };

    const state = {
      song,
      settings,
      project: undefined,
      masterFx,
      channelVolume: [1, 1, 1, 1],
      channelMuted: [false, false, false, false],
      masterVolume: 1,
    };
    let written: Uint8Array | null = null;
    const session = {
      getState: () => state,
      backend: {
        effectiveClip: () => clip,
        fusionRendering: () => false,
        fusionReady: () => false,
      },
      host: {
        fs: {
          writeBytesSafe: async (_path: string, bytes: Uint8Array) => {
            written = bytes;
            return { ok: true, value: "/tmp/out.wav" };
          },
        },
      },
      setStatus: () => {},
    } as unknown as Session;

    const result = await exportWav(session, "out.wav", {
      loops: 0,
      fadeInMs: 0,
      fadeOutMs: 0,
      normalize: false,
      lengthSeconds: 0,
    });
    expect(result.ok).toBe(true);
    expect(written).not.toBeNull();
    const bytes = written!;
    const dataSize = new DataView(
      bytes.buffer,
      bytes.byteOffset,
      bytes.byteLength,
    ).getUint32(40, true);
    const frames = dataSize / (2 * 2); // 2 channels, 16-bit
    const sequence = sequenceFromSong(song, settings);
    const songFrames = Math.ceil((sequence.rowTimes.at(-1) ?? 0) * RATE);
    // The file must be the song, not the song plus the delay/reverb tail.
    expect(frames).toBeLessThanOrEqual(songFrames + 1);
    expect(frames).toBeGreaterThanOrEqual(songFrames - 1);
  }, 60_000);
});
