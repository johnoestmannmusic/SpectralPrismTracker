import { describe, expect, it } from "vitest";
import {
  applyEdit,
  applySnapshot,
  buildSongModelFromProject,
  cellAt,
  patternSnapshot,
  retime,
  type SongModel,
} from "@/core/songModel";
import { rowDurationSec, songPositionAt } from "@/core/timing";
import {
  orderRowLength,
  songLoopRows,
  channelStepAtGlobal,
  totalSongRows,
} from "@/core/layout";
import {
  LOOKAHEAD_SEC,
  setSpectralEnabled,
  Scheduler,
  defaultSamplerSettings,
  envelopeAt,
  loopChannel,
  samplePosition,
  sequenceFromSong,
  waveform,
} from "@/core/sampler";
import { fixtureSong, fixtureText } from "./fixtures";
import {
  applyTimingOverrides,
  defaultProject,
  projectFromJson,
  projectToJson,
  validateProject,
} from "@/core/project";

function fixture(): SongModel {
  return fixtureSong();
}

describe("song model", () => {
  it("builds from the bundled fixture", () => {
    const song = fixture();
    expect(song.meta.name).toBe("aleph_lab01");
    expect(song.channels).toHaveLength(4);
    expect(song.instruments).toHaveLength(10);

    const colors = new Set(song.instruments.map((i) => i.colorRgb.join(",")));
    expect(colors.size).toBe(song.instruments.length);

    const ch0 = song.channels[0]!;
    expect(ch0.insTimeline).toHaveLength(ch0.orderList.length);
    expect(ch0.insTimeline[0]).toHaveLength(song.meta.patternLength);
    expect(ch0.noteTimeline[0]).toHaveLength(song.meta.patternLength);
    expect(ch0.noteTimeline.flat().some((note) => note !== null)).toBe(true);

    const rowDur = rowDurationSec(song.meta);
    expect(rowDur).toBeGreaterThan(0);
    const pos = songPositionAt(song, 0);
    expect(pos).toEqual({ orderPos: 0, row: 0 });
    const pos2 = songPositionAt(song, rowDur * song.meta.patternLength);
    expect(pos2.orderPos).toBe(1);
    expect(pos2.row).toBe(0);
  });

  it("keeps the channel instrument across a note-off", () => {
    const song = fixture();
    const empty = () => ({
      note: null,
      instrument: null,
      volume: null,
      effects: Array.from({ length: 8 }, () => ({ effect: null, value: null })),
    });
    applyEdit(song, {
      channel: 0,
      order: 0,
      row: 0,
      cell: { ...empty(), note: { kind: "note", note: 129 }, instrument: 0 },
    });
    applyEdit(song, {
      channel: 0,
      order: 0,
      row: 1,
      cell: { ...empty(), note: { kind: "off" } },
    });
    applyEdit(song, {
      channel: 0,
      order: 0,
      row: 2,
      cell: { ...empty(), note: { kind: "note", note: 127 } },
    });
    // A note after a note-off must still resolve to the held instrument.
    expect(song.channels[0]!.insTimeline[0]![2]).toBe(0);
    // The held note is still cleared by the OFF.
    expect(song.channels[0]!.noteTimeline[0]![1]).toBeNull();
  });

  it("applyEdit mutates the cell and regenerates timelines", () => {
    const song = fixture();
    applyEdit(song, {
      channel: 0,
      order: 0,
      row: 5,
      cell: {
        note: { kind: "note", note: 108 },
        instrument: 0,
        volume: 15,
        effects: Array.from({ length: 8 }, () => ({
          effect: null,
          value: null,
        })),
      },
    });
    const after = cellAt(song, 0, 0, 5);
    expect(after.note).toEqual({ kind: "note", note: 108 });
    expect(after.instrument).toBe(0);
    expect(after.volume).toBe(15);
    expect(song.channels[0]!.noteTimeline[0]![5]).toEqual({
      kind: "note",
      note: 108,
    });
    expect(song.channels[0]!.insTimeline[0]![5]).toBe(0);
  });

  it("loops channels independently at the LCM of their order lengths", () => {
    const cell = (note: number | null) => ({
      note: note === null ? null : { kind: "note" as const, note },
      instrument: note === null ? null : 0,
      volume: note === null ? null : 15,
      effects: Array.from({ length: 8 }, () => ({
        effect: null,
        value: null,
      })),
    });
    const project = defaultProject();
    project.instruments = [defaultSamplerSettings()];
    project.patternSnapshot = {
      orderLength: 3,
      channels: [
        {
          orderLength: 2,
          orderList: [0, 1],
          patterns: [
            [0, [cell(60)]],
            [1, [cell(62)]],
          ],
        },
        {
          orderLength: 3,
          orderList: [0, 1, 2],
          patterns: [
            [0, [cell(48)]],
            [1, [cell(50)]],
            [2, [cell(52)]],
          ],
        },
        { orderLength: 1, orderList: [0], patterns: [[0, [cell(40)]]] },
        { orderLength: 1, orderList: [0], patterns: [[0, [cell(36)]]] },
      ],
    };
    const song = buildSongModelFromProject(project);
    // UI span is the longest channel; playback loops at the LCM (2·3 = 6).
    expect(song.meta.orderLength).toBe(3);
    expect(song.rowTimes.length).toBe(6 * song.meta.patternLength + 1);

    // Channel 0 (length 2) wraps: order 2 reuses pattern 0.
    expect(song.channels[0]!.insTimeline.length).toBe(6);
    expect(song.channels[0]!.noteTimeline[0]![0]).toEqual({
      kind: "note",
      note: 60,
    });
    expect(song.channels[0]!.noteTimeline[1]![0]).toEqual({
      kind: "note",
      note: 62,
    });
    expect(song.channels[0]!.noteTimeline[2]![0]).toEqual({
      kind: "note",
      note: 60,
    });

    const seq = sequenceFromSong(song);
    expect(seq.rows.length).toBe(6 * song.meta.patternLength);
    const wrappedRow = song.meta.patternLength * 2;
    const wrapped = seq.rows[wrappedRow]!.filter((e) => e.type === "note");
    expect(wrapped).toHaveLength(4);
  });

  it("honours per-pattern row lengths in timing and sequence", () => {
    const cell = (note: number | null) => ({
      note: note === null ? null : { kind: "note" as const, note },
      instrument: note === null ? null : 0,
      volume: note === null ? null : 15,
      effects: Array.from({ length: 8 }, () => ({
        effect: null,
        value: null,
      })),
    });
    const project = defaultProject();
    project.instruments = [defaultSamplerSettings()];
    project.patternSnapshot = {
      orderLength: 2,
      channels: [
        {
          orderLength: 2,
          orderList: [0, 1],
          patterns: [
            [0, [cell(60)], 8],
            [1, [cell(62)], 3],
          ],
        },
      ],
    };
    const song = buildSongModelFromProject(project);
    expect(orderRowLength(song, 0)).toBe(8);
    expect(orderRowLength(song, 1)).toBe(3);
    expect(totalSongRows(song)).toBe(11);
    expect(song.rowTimes.length).toBe(12);
    expect(sequenceFromSong(song).rows.length).toBe(11);
    // The short order is still addressable and wraps to the next order.
    const position = songPositionAt(song, song.rowTimes[8]! + 0.0001);
    expect(position.orderPos).toBe(1);
    expect(position.row).toBe(0);
  });

  it("drifts channels independently in true polymeter", () => {
    const cell = (note: number | null) => ({
      note: note === null ? null : { kind: "note" as const, note },
      instrument: note === null ? null : 0,
      volume: note === null ? null : 15,
      effects: Array.from({ length: 8 }, () => ({
        effect: null,
        value: null,
      })),
    });
    const project = defaultProject();
    project.instruments = [defaultSamplerSettings()];
    project.patternSnapshot = {
      orderLength: 1,
      channels: [
        {
          orderLength: 1,
          orderList: [0],
          patterns: [[0, [cell(60)], 4]],
        },
        {
          orderLength: 1,
          orderList: [0],
          patterns: [[0, [cell(67)], 6]],
        },
      ],
    };
    const song = buildSongModelFromProject(project);
    expect(songLoopRows(song)).toBe(12); // LCM(4, 6)
    expect(song.rowTimes.length).toBe(13);
    expect(sequenceFromSong(song).rows.length).toBe(12);

    // At row 4 the 4-row channel has wrapped to 0 while the 6-row channel is
    // still at row 4 — the channels are audibly out of step.
    expect(channelStepAtGlobal(song, 0, 4)).toMatchObject({ order: 0, row: 0 });
    expect(channelStepAtGlobal(song, 1, 4)).toMatchObject({ order: 0, row: 4 });
    // They realign at the LCM point.
    expect(channelStepAtGlobal(song, 0, 12)).toMatchObject({ row: 0 });
    expect(channelStepAtGlobal(song, 1, 12)).toMatchObject({ row: 0 });
  });

  it("retime recomputes row times from a changed BPM", () => {
    const song = fixture();
    const originalSecondRow = song.rowTimes[1]!;
    song.meta.bpm *= 2;
    retime(song);
    expect(Math.abs(song.rowTimes[1]! - originalSecondRow / 2)).toBeLessThan(
      1e-9,
    );
  });

  it("pattern snapshot round-trips through applySnapshot", () => {
    const song = fixture();
    const before = patternSnapshot(song);
    const song2 = fixture();
    applySnapshot(song2, before);
    expect(patternSnapshot(song2)).toEqual(before);
    expect(song2.rowTimes).toEqual(song.rowTimes);
    for (let i = 0; i < song.channels.length; i++) {
      expect(song2.channels[i]!.noteTimeline).toEqual(
        song.channels[i]!.noteTimeline,
      );
      expect(song2.channels[i]!.insTimeline).toEqual(
        song.channels[i]!.insTimeline,
      );
    }
  });

  it("applies BPM up/down effects to row timing", () => {
    const project = defaultProject();
    project.instruments = [defaultSamplerSettings()];
    project.bpmOverride = 120;
    project.highlightAOverride = 4;
    const emptyEffects = () =>
      Array.from({ length: 8 }, () => ({ effect: null, value: null }));
    const effectCell = (effect: number, value: number) => ({
      note: null,
      instrument: null,
      volume: null,
      effects: [{ effect, value }, ...emptyEffects().slice(1)],
    });
    project.patternSnapshot = {
      orderLength: 1,
      channels: [
        {
          orderLength: 1,
          orderList: [0],
          patterns: [
            [
              0,
              Array.from({ length: 64 }, (_, row) =>
                row === 1
                  ? effectCell(0x09, 10) // tempo up 120 -> 130
                  : row === 2
                    ? effectCell(0x0a, 10) // tempo down 130 -> 120
                    : {
                        note: null,
                        instrument: null,
                        volume: null,
                        effects: emptyEffects(),
                      },
              ),
            ],
          ],
        },
      ],
    };
    const song = buildSongModelFromProject(project);
    expect(song.meta.bpm).toBe(120);
    expect(song.rowTimes[1]! - song.rowTimes[0]!).toBeCloseTo(
      60 / (120 * 4),
      6,
    );
    expect(song.rowTimes[2]! - song.rowTimes[1]!).toBeCloseTo(
      60 / (130 * 4),
      6,
    );
    expect(song.rowTimes[3]! - song.rowTimes[2]!).toBeCloseTo(
      60 / (120 * 4),
      6,
    );
    for (let i = 1; i < song.rowTimes.length; i++) {
      expect(song.rowTimes[i]!).toBeGreaterThan(song.rowTimes[i - 1]!);
    }
  });
});

describe("sampler", () => {
  const sequence = () => ({
    tuning: 440,
    rows: [[], [], [], []],
    rowTimes: [0, 0.1, 0.2, 0.3, 0.4],
  });

  it("preroll never schedules before the transport anchor", () => {
    const s = new Scheduler(sequence(), 0.05, 0);
    const rows = s.tick(0, LOOKAHEAD_SEC);
    expect(rows[0]!.row).toBe(0);
    expect(rows[0]!.when).toBe(0.05);
    expect(rows.every((r) => r.when >= 0.05)).toBe(true);
    expect(s.tick(0, LOOKAHEAD_SEC)).toEqual([]);
  });

  it("loops keep scheduling without duplicates", () => {
    const s = new Scheduler(sequence(), 2, 0);
    const rows: { row: number; when: number }[] = [];
    for (let i = 0; i <= 80; i++)
      rows.push(...s.tick(2 + i * 0.025, LOOKAHEAD_SEC));
    expect(rows.length).toBeGreaterThan(20);
    rows.forEach((r, i) => {
      expect(r.row).toBe(i % 4);
      expect(Math.abs(r.when - (2 + i * 0.1))).toBeLessThan(1e-9);
    });
  });

  it("seek mid-row and late wake are bounded", () => {
    const s = new Scheduler(sequence(), 10.05, 0.25);
    const rows = s.tick(10, LOOKAHEAD_SEC);
    expect(rows[0]!.row).toBe(2);
    expect(rows[0]!.when).toBe(10.05);
    const rows2 = s.tick(110, LOOKAHEAD_SEC);
    expect(rows2.length).toBeLessThanOrEqual(3);
    expect(rows2.every((r) => r.when >= 110)).toBe(true);
  });

  it("fixture sequence uses actual note cells and held instruments", () => {
    const song = fixture();
    const seq = sequenceFromSong(song);
    expect(seq.rows).toHaveLength(
      song.meta.orderLength * song.meta.patternLength,
    );
    const first = seq.rows.flat().find((event) => event.type === "note");
    expect(first).toBeDefined();
    if (first && first.type === "note") {
      expect(first.instrument).toBeGreaterThanOrEqual(0);
    }
  });

  it("envelope has a click-safe attack and reaches sustain", () => {
    const s = defaultSamplerSettings();
    s.attack = 0.1;
    s.decay = 0.2;
    s.sustain = 0.25;
    expect(envelopeAt(s, -0.1)).toBe(0);
    expect(Math.abs(envelopeAt(s, 0.05) - 0.5)).toBeLessThan(1e-6);
    expect(Math.abs(envelopeAt(s, 0.2) - 0.625)).toBeLessThan(1e-6);
    expect(envelopeAt(s, 1)).toBe(0.25);
  });

  it("ping-pong loop mirrors and declicks both seams", () => {
    const data = new Float32Array(20).fill(1);
    const out = loopChannel(data, 1000, 0, 0.02, true);
    expect(out.length).toBe(40);
    expect(out[0]).toBe(0);
    expect(out[19]).toBe(0);
    expect(out[20]).toBe(0);
    expect(out[39]).toBe(0);
    for (let i = 0; i < 20; i++) expect(out[i]).toBe(out[39 - i]);
    expect(out[10]).toBe(1);
    expect(loopChannel(data, 1000, 1, 2, false).length).toBe(0);
  });

  it("ping-pong playhead reverses and rate changes duration", () => {
    const s = defaultSamplerSettings();
    s.startSec = 1;
    s.endSec = 2;
    s.looping = true;
    s.pingPong = true;
    expect(samplePosition(s, 0.25, 2)).toBe(1.5);
    expect(samplePosition(s, 0.75, 2)).toBe(1.5);
    expect(samplePosition(s, 1, 2)).toBe(1);
  });

  it("waveform bins min/max", () => {
    const data = Float32Array.from([-1, 1, -0.5, 0.5]);
    const wf = waveform(data, 2);
    expect(wf).toEqual([
      [-1, 1],
      [-0.5, 0.5],
    ]);
  });
});

describe("project json", () => {
  it("original project round-trips without losing its schema", () => {
    const project = projectFromJson(
      fixtureText("tests/fixtures/lmp-default-proj.legacy.lampjson"),
    );
    validateProject(project, 10);
    expect(project.sourceSamples).toHaveLength(6);
    expect(project.instruments).toHaveLength(10);
    expect(project.songTitle).toBe("0006 - alpha _CD");
    expect(project.instruments[0]!.spectral.mode).toBe("off");

    const encoded = projectToJson(project);
    expect(encoded).toContain('"channelVolume"');
    expect(encoded).toContain('"sourceIndex2"');
    expect(encoded).not.toContain('"muted"');
    const reparsed = projectFromJson(encoded);
    expect(reparsed).toEqual(project);
  });

  it("round-trips per-channel order lengths", () => {
    const empty = () => ({
      note: null,
      instrument: null,
      volume: null,
      effects: Array.from({ length: 8 }, () => ({
        effect: null,
        value: null,
      })),
    });
    const project = defaultProject();
    project.instruments = [defaultSamplerSettings()];
    project.patternSnapshot = {
      orderLength: 3,
      channels: [
        {
          orderLength: 3,
          orderList: [0, 1, 2],
          patterns: [
            [0, [empty()]],
            [1, [empty()]],
            [2, [empty()]],
          ],
        },
        { orderLength: 1, orderList: [0], patterns: [[0, [empty()]]] },
        {
          orderLength: 2,
          orderList: [0, 1],
          patterns: [
            [0, [empty()]],
            [1, [empty()]],
          ],
        },
        { orderLength: 1, orderList: [0], patterns: [[0, [empty()]]] },
      ],
    };
    const reread = projectFromJson(projectToJson(project));
    expect(
      reread.patternSnapshot!.channels.map((channel) => channel.orderLength),
    ).toEqual([3, 1, 2, 1]);
    expect(reread.patternSnapshot!.orderLength).toBe(3);
    const song = buildSongModelFromProject(reread);
    expect(song.meta.orderLength).toBe(3);
    expect(song.channels.map((channel) => channel.orderLength)).toEqual([
      3, 1, 2, 1,
    ]);
  });

  it("defaults per-channel order length to the order list when absent", () => {
    const project = projectFromJson(
      JSON.stringify({
        version: 1,
        instruments: [{}],
        patternSnapshot: {
          orderLength: 2,
          channels: [
            { orderList: [0, 1], patterns: [] },
            { orderList: [0], patterns: [] },
          ],
        },
      }),
    );
    expect(
      project.patternSnapshot!.channels.map((channel) => channel.orderLength),
    ).toEqual([2, 1]);
  });

  it("legacy rootNote converts to transpose", () => {
    const value = JSON.parse(
      fixtureText("tests/fixtures/lmp-default-proj.legacy.lampjson"),
    ) as {
      instruments: Array<Record<string, unknown>>;
    };
    const first = value.instruments[0]!;
    delete first.transpose;
    first.rootNote = 117;
    const project = projectFromJson(JSON.stringify(value));
    expect(project.instruments[0]!.transpose).toBe(12);
  });

  it("switching Spectral on loops by default and restores the sampler loop on exit", () => {
    const settings = defaultSamplerSettings();
    settings.looping = false;
    setSpectralEnabled(settings, true);
    expect(settings.spectral.enabled).toBe(true);
    expect(settings.looping).toBe(true);
    setSpectralEnabled(settings, false);
    expect(settings.spectral.enabled).toBe(false);
    expect(settings.looping).toBe(false);
  });

  it("round-trips master FX settings", () => {
    const project = projectFromJson(
      fixtureText("tests/fixtures/lmp-default-proj.legacy.lampjson"),
    );
    project.masterFx.delay.enabled = true;
    project.masterFx.delay.timeSec = 0.19;
    project.masterFx.delay.feedback = 0.5;
    project.masterFx.reverb.enabled = true;
    project.masterFx.reverb.decaySec = 3.5;
    const reread = projectFromJson(projectToJson(project));
    expect(reread.masterFx).toEqual(project.masterFx);
  });

  it("round-trips vibrato settings", () => {
    const project = projectFromJson(
      fixtureText("tests/fixtures/lmp-default-proj.legacy.lampjson"),
    );
    project.instruments[0]!.vibratoSpeed = 7.5;
    project.instruments[0]!.vibratoDepth = 0.4;
    const reread = projectFromJson(projectToJson(project));
    expect(reread.instruments[0]!.vibratoSpeed).toBe(7.5);
    expect(reread.instruments[0]!.vibratoDepth).toBe(0.4);
  });

  it("round-trips instrument display names", () => {
    const project = projectFromJson(
      fixtureText("tests/fixtures/lmp-default-proj.legacy.lampjson"),
    );
    project.instrumentNames = ["Bass 1", "Lead", "Perc"];
    const reread = projectFromJson(projectToJson(project));
    expect(reread.instrumentNames).toEqual(["Bass 1", "Lead", "Perc"]);
  });

  it("round-trips the instrument pan centre and random width", () => {
    const project = projectFromJson(
      fixtureText("tests/fixtures/lmp-default-proj.legacy.lampjson"),
    );
    project.instruments[0]!.pan = -0.5;
    project.instruments[0]!.panRandomRange = 0.25;
    const reread = projectFromJson(projectToJson(project));
    expect(reread.instruments[0]!.pan).toBe(-0.5);
    expect(reread.instruments[0]!.panRandomRange).toBe(0.25);
  });

  it("gracefully imports the legacy Fusion schema and unknown modes", () => {
    const value = JSON.parse(
      fixtureText("tests/fixtures/lmp-default-proj.legacy.lampjson"),
    ) as {
      instruments: Array<Record<string, unknown>>;
    };
    const first = value.instruments[0]!;
    delete first.spectral;
    first.spectralFusion = {
      enabled: true,
      mode: "spectral-blend",
      algorithm: "spectral-blend",
      freezePoint: 30,
    };
    delete first.transpose;
    first.rootNote = 117;
    value.instruments[1]!.spectral = { mode: "totally-unknown" };

    const project = projectFromJson(JSON.stringify(value));
    expect(project.instruments[0]!.transpose).toBe(12); // rootNote migration
    expect(project.instruments[0]!.spectral.enabled).toBe(true);
    expect(project.instruments[0]!.spectral.mode).toBe("cross-synth");
    expect(project.instruments[1]!.spectral.mode).toBe("off");
  });

  it("migrates legacy tick rate + speed into a single BPM", () => {
    const project = projectFromJson(
      fixtureText("assets/lmp-default-proj.lampjson"),
    );
    // 60 * 47.2 * 150 / (6 * 150 * 4) = 118 BPM, preserving row duration.
    expect(project.bpmOverride).toBeCloseTo(118, 4);
  });

  it("applyTimingOverrides only touches fields that are set", () => {
    const song = fixture();
    const originalSecondRow = song.rowTimes[1]!;
    const originalBpm = song.meta.bpm;

    applyTimingOverrides(
      projectFromJson(
        fixtureText("tests/fixtures/lmp-default-proj.legacy.lampjson"),
      ),
      song,
    );
    expect(song.meta.bpm).toBe(originalBpm);

    const project = projectFromJson(
      fixtureText("tests/fixtures/lmp-default-proj.legacy.lampjson"),
    );
    project.bpmOverride = originalBpm * 2;
    project.highlightAOverride = 8;
    project.highlightBOverride = 16;
    applyTimingOverrides(project, song);
    expect(song.meta.bpm).toBe(originalBpm * 2);
    expect(song.meta.highlightA).toBe(8);
    expect(song.meta.highlightB).toBe(16);
    expect(song.rowTimes[1]).not.toBe(originalSecondRow);
  });
});
