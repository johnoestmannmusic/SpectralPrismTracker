import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createRegistry } from "@/tui/commands";
import type { CommandContext } from "@/tui/commands/types";
import { Session } from "@/tui/session";
import { pitchSlideRate } from "@/core/tracker";
import { contextActions } from "@/tui/contextActions";
import { cellAt } from "@/core/songModel";

const registry = createRegistry();
const session = new Session();

function ctx(): CommandContext {
  return { session, listCommands: () => registry.all() };
}

async function run(line: string) {
  return registry.execute(line, ctx());
}

describe("tracker block operations", () => {
  beforeAll(async () => {
    await session.init();
  }, 60_000);

  afterAll(() => {
    session.dispose();
  });

  it("q/a bump the value under the cursor", () => {
    session.setCursor({ order: 0, channel: 3, row: 0, column: 0 });
    const before = session.song!.channels[3]!.patterns.get(
      session.song!.channels[3]!.orderList[0]!,
    )!.rows[0]!.note;
    expect(before?.kind).toBe("note");
    session.adjustValue(1);
    const after = session.song!.channels[3]!.patterns.get(
      session.song!.channels[3]!.orderList[0]!,
    )!.rows[0]!.note;
    expect((after as { note: number }).note).toBe(
      (before as { note: number }).note + 1,
    );
    session.undo();
  });

  it("copies, pastes and undoes a block", () => {
    session.setCursor({ order: 0, channel: 3, row: 0, column: 0 });
    session.clearSelection();
    session.extendSelection({ row: 2 });
    expect(session.copySelection()).toBe(true);

    session.setCursor({ order: 0, channel: 3, row: 10, column: 0 });
    session.clearSelection();
    expect(session.pasteSelection()).toBe(true);
    expect(session.backend).not.toBeNull();
    session.undo();
    session.undo();
  });

  it("transposes a selected block", () => {
    session.setCursor({ order: 0, channel: 3, row: 0, column: 0 });
    session.clearSelection();
    session.extendSelection({ row: 1 });
    expect(session.transposeSelection(12)).toBe(true);
    session.undo();
  });

  it("visual selection anchors at the cursor and arrows extend the block", () => {
    session.setCursor({ order: 0, channel: 3, row: 2, column: 0 });
    session.clearSelection();
    session.startSelection();
    expect(session.selection()).toMatchObject({ rowLo: 2, rowHi: 2 });
    session.extendSelection({ row: 2 });
    expect(session.selection()).toMatchObject({ rowLo: 2, rowHi: 4 });
    session.clearSelection();
    expect(session.selection()).toBeNull();
  });

  it("inserts and removes orders", async () => {
    const before = session.song!.meta.orderLength;
    const beforeDuration = session.backend!.songDuration();
    expect((await run("insert")).ok).toBe(true);
    expect(session.song!.meta.orderLength).toBe(before + 1);
    // The audio engine must be re-published after a structural change, or it
    // keeps scheduling the pre-edit orders (stale sequence).
    expect(session.backend!.songDuration()).toBeCloseTo(
      session.song!.rowTimes.at(-1)!,
      6,
    );
    expect(session.backend!.songDuration()).toBeGreaterThan(beforeDuration);
    expect((await run("remove")).ok).toBe(true);
    expect(session.song!.meta.orderLength).toBe(before);
    expect(session.backend!.songDuration()).toBeCloseTo(beforeDuration, 6);
  });

  it("edits one channel's order length without touching the others", () => {
    const lengthsBefore = session.channelOrderLengths();
    const othersBefore = session.song!.channels[0]!.orderList.slice();
    expect(session.insertChannelOrder(1, 0, false)).toBe(true);
    expect(session.channelOrderLengths()[1]).toBe(lengthsBefore[1]! + 1);
    expect(session.song!.channels[0]!.orderList).toEqual(othersBefore);
    expect(session.song!.meta.orderLength).toBeGreaterThanOrEqual(
      session.channelOrderLengths()[1]!,
    );
    // The engine sequence is rebuilt over the new LCM loop length.
    expect(session.backend!.songDuration()).toBeCloseTo(
      session.song!.rowTimes.at(-1)!,
      6,
    );
    expect(session.removeChannelOrder(1, 0)).toBe(true);
    expect(session.channelOrderLengths()[1]).toBe(lengthsBefore[1]!);
    session.undo();
    session.undo();
  });

  it("sets a channel length explicitly, growing and trimming", () => {
    const otherBefore = session.song!.channels[2]!.orderList.length;
    expect(session.setChannelOrderLength(1, 3)).toBe(true);
    expect(session.channelOrderLengths()[1]).toBe(3);
    expect(session.song!.channels[2]!.orderList.length).toBe(otherBefore);
    expect(session.setChannelOrderLength(1, 1)).toBe(true);
    expect(session.channelOrderLengths()[1]).toBe(1);
    session.undo();
    session.undo();
  });

  it("sets a pattern's row count and name for an order slot", () => {
    session.setViewOrder(0);
    const before = session.patternSlotInfo(0, 0)!;
    expect(session.setPatternRowLength(0, 0, 8)).toBe(true);
    expect(session.patternSlotInfo(0, 0)!.rowLength).toBe(8);
    expect(session.orderRows(0)).toBeGreaterThanOrEqual(8);
    // The engine re-publishes the variable-row sequence after the edit.
    expect(session.backend!.songDuration()).toBeCloseTo(
      session.song!.rowTimes.at(-1)!,
      6,
    );
    expect(session.setPatternName(0, 0, "Phase A")).toBe(true);
    expect(session.patternSlotInfo(0, 0)!.name).toBe("Phase A");
    session.undo();
    session.undo();
    expect(session.patternSlotInfo(0, 0)!.rowLength).toBe(before.rowLength);
  });

  it("re-arranges orders with /move", async () => {
    const channel = session.song!.channels[0]!;
    const before = channel.orderList.slice(0, 2);
    expect((await run("move down 0")).ok).toBe(true);
    expect(channel.orderList[0]).toBe(before[1]);
    expect(channel.orderList[1]).toBe(before[0]);
    // Swap back so later tests see the original arrangement.
    expect((await run("move up 1")).ok).toBe(true);
    expect(channel.orderList.slice(0, 2)).toEqual(before);
  });

  it("re-points a pattern number with /setpattern", async () => {
    const channel = session.song!.channels[0]!;
    const original = channel.orderList[0];
    expect((await run("setpattern 0 42")).ok).toBe(true);
    expect(channel.orderList[0]).toBe(42);
    expect(channel.patterns.has(42)).toBe(true);
    expect((await run(`setpattern 0 ${original}`)).ok).toBe(true);
    expect(channel.orderList[0]).toBe(original);
  });

  it("honours step when entering notes", async () => {
    await run("step 3");
    session.setCursor({ order: 0, channel: 0, row: 0, column: 0 });
    await run("note C-4");
    expect(session.getState().cursor.row).toBe(3);
    await run("step 1");
    session.undo();
  });

  it("auditions a row for ~2 rows", () => {
    const engine = session.backend!;
    const spy = vi.spyOn(engine, "previewPattern");
    session.auditionRow([3], 0, 0);
    expect(spy).toHaveBeenCalled();
    const duration = spy.mock.calls[0]?.[2] as number;
    expect(duration).toBeGreaterThan(0);
    spy.mockRestore();
  });

  it("auditions a ratchet as several delayed hits", () => {
    session.setStep(0);
    session.setCursor({ channel: 3, order: 0, row: 0, column: 3 });
    expect(session.setEffectCode(0x11)).toBe(true);
    session.adjustValue(4);
    const engine = session.backend!;
    const spy = vi.spyOn(engine, "previewPattern");
    session.auditionRow([3], 0, 0);
    const notes = (spy.mock.calls.at(-1)?.[3] ?? []) as Array<{
      delaySec?: number;
    }>;
    expect(notes.length).toBeGreaterThanOrEqual(4);
    expect(notes.some((note) => (note.delaySec ?? 0) > 0)).toBe(true);
    spy.mockRestore();
    session.undo();
    session.undo();
    session.setStep(1);
  });

  it("auditions after entering a note", () => {
    const spy = vi.spyOn(session, "auditionRow");
    session.setCursor({ order: 0, channel: 3, row: 0, column: 0 });
    session.editCell({ note: { kind: "note", note: 60 } });
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
    session.undo();
  });

  it("computes a pitch-slide target for 01/02 effects", () => {
    expect(pitchSlideRate(1, 0x01, 32, 6)).toBeCloseTo(Math.SQRT2, 5);
    expect(pitchSlideRate(1, 0x02, 32, 6)).toBeCloseTo(1 / Math.SQRT2, 5);
    expect(pitchSlideRate(1, 0x09, 5, 6)).toBeUndefined();
    expect(pitchSlideRate(1, 0x01, null, 6)).toBeUndefined();
  });

  it("toggles ghost rows by command (off by default)", async () => {
    expect(session.getState().ghosting).toBe(false);
    expect((await run("ghosting on")).ok).toBe(true);
    expect(session.getState().ghosting).toBe(true);
    expect((await run("ghosting off")).ok).toBe(true);
    expect(session.getState().ghosting).toBe(false);
  });

  it("toggles Cycles Mode by command", async () => {
    expect(session.getState().cyclesMode).toBe(false);
    expect((await run("cycles on")).ok).toBe(true);
    expect(session.getState().cyclesMode).toBe(true);
    expect((await run("cycles off")).ok).toBe(true);
    expect(session.getState().cyclesMode).toBe(false);
  });

  it("persists Cycles Mode to the config store", async () => {
    session.setCyclesMode(true);
    await session.flushConfigWrites();
    expect((await session.host.config.read()).cyclesMode).toBe(true);
    session.setCyclesMode(false);
    await session.flushConfigWrites();
    expect((await session.host.config.read()).cyclesMode).toBe(false);
  });

  it("uses glitch defaults for instruments created in Cycles Mode", () => {
    session.setCyclesMode(true);
    try {
      const index = session.addInstrument();
      const settings = session.samplerSettings(index)!;
      expect(settings.looping).toBe(true);
      expect(settings.pingPong).toBe(true);
      expect(settings.panRandomRange).toBeGreaterThan(0);
      session.undo();
    } finally {
      session.setCyclesMode(false);
    }
  });

  it("sets per-channel phase and speed", () => {
    session.setViewOrder(0);
    expect(session.setChannelPhaseOffset(0, 3)).toBe(true);
    expect(session.channelPhaseOffset(0)).toBe(3);
    expect(session.setChannelSpeed(1, 2)).toBe(true);
    expect(session.channelSpeed(1)).toBe(2);
    session.undo();
    session.undo();
    expect(session.channelPhaseOffset(0)).toBe(0);
    expect(session.channelSpeed(1)).toBe(1);
  });

  it("re-expands the sequence when the chord shape changes", () => {
    const engine = session.backend!;
    const spy = vi.spyOn(engine, "updateSequence");
    const current = session.samplerSettings(0)!;
    session.updateSamplerSetting(0, {
      chord: { ...current.chord, enabled: true, preset: "sus2" },
    });
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
    session.undo();
  });

  it("opens the WAV export modal when /export wav has no path", async () => {
    const opened: string[] = [];
    const result = await registry.execute("export wav", {
      session,
      listCommands: () => registry.all(),
      openOverlay: (name) => {
        opened.push(name);
      },
    });
    expect(result.ok).toBe(true);
    expect(opened).toContain("wav");
  });

  it("re-publishes the sequence after duplicating an instrument", () => {
    const engine = session.backend!;
    const spy = vi.spyOn(engine, "updateSequence");
    const before = session.song!.instruments.length;
    const index = session.duplicateInstrument(0);
    expect(index).toBe(1);
    expect(session.song!.instruments.length).toBe(before + 1);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
    session.undo();
  });

  it("sets an FX code from the picker", () => {
    session.setCursor({ channel: 0, order: 0, row: 0, column: 3 });
    expect(session.setEffectCode(0x09)).toBe(true);
    expect(cellAt(session.song!, 0, 0, 0).effects[0]!.effect).toBe(0x09);
    session.undo();
  });

  it("offers FX types on an effect column", () => {
    const actions = contextActions(session.getState(), {
      kind: "tracker",
      channel: 0,
      order: 0,
      row: 0,
      column: 3,
    });
    expect(actions.some((action) => action.special === "set-fx:16")).toBe(true);
    expect(actions.some((action) => action.special === "clear-fx")).toBe(true);
  });

  it("recalls command history", () => {
    session.recordCommand("preview 5");
    session.recordCommand("info");
    expect(session.recallCommand(-1)).toBe("info");
    expect(session.recallCommand(-1)).toBe("preview 5");
    expect(session.recallCommand(1)).toBe("info");
  });

  it("toggles follow by command", async () => {
    session.setFollow(true);
    expect((await run("follow off")).ok).toBe(true);
    expect(session.getState().follow).toBe(false);
    await run("follow on");
    expect(session.getState().follow).toBe(true);
  });

  it("keeps follow on while navigating and editing", () => {
    session.setFollow(true);
    session.moveCursor({ order: 1 });
    expect(session.getState().follow).toBe(true);
    session.setCursor({ order: 0, row: 0, channel: 0, column: 0 });
    expect(session.getState().follow).toBe(true);
    session.editCell({ note: { kind: "note", note: 60 } });
    expect(session.getState().follow).toBe(true);
    session.undo();
  });

  it("wraps rows across pattern boundaries", () => {
    const patternLength = session.song!.meta.patternLength;
    session.setCursor({
      order: 0,
      row: patternLength - 1,
      channel: 0,
      column: 0,
    });
    session.moveCursor({ row: 1 });
    expect(session.getState().cursor.order).toBe(1);
    expect(session.getState().cursor.row).toBe(0);
    session.moveCursor({ row: -1 });
    expect(session.getState().cursor.order).toBe(0);
    expect(session.getState().cursor.row).toBe(patternLength - 1);
  });

  it("cycles orders with wrap-around", () => {
    const orderLength = session.song!.meta.orderLength;
    session.setCursor({
      order: orderLength - 1,
      row: 0,
      channel: 0,
      column: 0,
    });
    session.moveCursor({ order: 1 });
    expect(session.getState().cursor.order).toBe(0);
    session.moveCursor({ order: -1 });
    expect(session.getState().cursor.order).toBe(orderLength - 1);
  });

  it("Ctrl+arrow jumps 16 rows and changes channel to NOTE", () => {
    session.setCursor({ order: 0, row: 0, channel: 0, column: 2 });
    session.moveCursor({ row: 16 });
    expect(session.getState().cursor.row).toBe(16);
    session.moveCursor({ channel: 1 });
    expect(session.getState().cursor.channel).toBe(1);
    expect(session.getState().cursor.column).toBe(0);
  });

  it("scrolls the view with the playhead while following", async () => {
    const engine = session.backend!;
    const deadline = Date.now() + 20_000;
    while (!engine.samplerReady() && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    session.setCursor({ order: 0, row: 0, channel: 0, column: 0 });
    session.setFollow(true);
    await run("play");
    const end = Date.now() + 4000;
    let advanced = false;
    while (Date.now() < end && !advanced) {
      session.refreshPlayhead();
      if ((session.getState().viewRow ?? 0) > 0) advanced = true;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    await run("stop");
    expect(advanced).toBe(true);
    // Editing never disabled follow along the way.
    expect(session.getState().follow).toBe(true);
  }, 30_000);

  it("select-all, note off and octave adjust use the selection", () => {
    session.setCursor({ order: 0, row: 0, channel: 0, column: 0 });
    session.selectAll();
    expect(session.selection()).not.toBeNull();
    session.noteOff();
    session.adjustValue(12);
    session.undo();
    session.undo();
    session.clearSelection();
  });

  it("plays from the selected cell (Ctrl+Space)", async () => {
    const engine = session.backend!;
    const deadline = Date.now() + 20_000;
    while (!engine.samplerReady() && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    session.setCursor({ order: 0, row: 8, channel: 0, column: 0 });
    session.playFromCursor();
    await new Promise((resolve) => setTimeout(resolve, 250));
    session.refreshPlayhead();
    expect(session.getState().playing).toBe(true);
    // Started at row 8, so the clock is already past the first few rows.
    expect(session.getState().time).toBeGreaterThan(0.5);
    await run("stop");
  }, 30_000);
});

describe("file and export commands", () => {
  let dir = "";

  beforeAll(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "lantern-io-"));
  }, 60_000);

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("saves notes and instrument settings, then reopens them", async () => {
    const target = path.join(dir, "song.lampjson");
    session.setCursor({ order: 0, channel: 3, row: 5, column: 0 });
    session.editCell({ note: { kind: "note", note: 65 } });
    session.updateSamplerSetting(1, { attack: 1.234 });
    expect((await run(`save "${target}"`)).ok).toBe(true);
    expect(session.getState().projectPath).toBe(target);
    const text = await readFile(target, "utf8");
    expect(text).toContain("version");
    expect(text).toContain("patternSnapshot");

    const opened = await run(`open "${target}"`);
    expect(opened.ok).toBe(true);
    expect(session.getState().projectPath).toBe(target);
    expect(session.getState().song).not.toBeNull();
    expect(cellAt(session.song!, 3, 0, 5).note).toMatchObject({
      kind: "note",
      note: 65,
    });
    expect(session.samplerSettings(1)?.attack).toBeCloseTo(1.234, 5);
  });

  it("exports MIDI", async () => {
    const result = await run(`export mid "${path.join(dir, "song.mid")}"`);
    expect(result.ok).toBe(true);
    const bytes = await readFile(path.join(dir, "song.mid"));
    expect(bytes.length).toBeGreaterThan(0);
    expect(bytes.subarray(0, 4).toString("ascii")).toBe("MThd");
  });

  it("exports a source-sample ZIP", async () => {
    const result = await run(`export zip "${path.join(dir, "samples.zip")}"`);
    expect(result.ok).toBe(true);
    const bytes = await readFile(path.join(dir, "samples.zip"));
    expect(bytes.subarray(0, 2).toString("ascii")).toBe("PK");
  });

  it("exports the cover art as a PNG", async () => {
    const target = path.join(dir, "cover.png");
    const result = await run(`export png "${target}"`);
    expect(result.ok).toBe(true);
    const bytes = await readFile(target);
    expect(Array.from(bytes.subarray(0, 8))).toEqual([
      137, 80, 78, 71, 13, 10, 26, 10,
    ]);
  });

  it("starts a new project", async () => {
    const result = await run("new");
    expect(result.ok).toBe(true);
    expect(session.getState().song).not.toBeNull();
    // A fresh project has no on-disk path (Ctrl+S should prompt).
    expect(session.getState().projectPath).toBeNull();
  });

  it("completes file paths for /open", async () => {
    const def = registry.get("open")!;
    const candidates = await registry.completeArg(def, 0, dir, ctx());
    expect(candidates.length).toBeGreaterThan(0);
  });
});
