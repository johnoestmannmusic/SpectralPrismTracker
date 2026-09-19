import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { contextActions } from "@/tui/contextActions";
import { createRegistry } from "@/tui/commands";
import { Session } from "@/tui/session";

/**
 * Covers the UX pass (FEAT-87..99): the shared context-action resolver and the
 * global undo/redo stack that now spans structural and settings edits.
 */
const session = new Session();

beforeAll(async () => {
  await session.init();
}, 60_000);

afterAll(() => {
  session.dispose();
});

describe("contextActions", () => {
  it("tracker cell exposes audition, instrument edit and order actions", () => {
    session.setCursor({ order: 0, channel: 3, row: 0, column: 0 });
    const actions = contextActions(session.getState(), {
      kind: "tracker",
      channel: 3,
      order: 0,
      row: 0,
      column: 0,
    });
    const ids = actions.map((action) => action.id);
    expect(ids).toContain("audition");
    expect(ids).toContain("edit-instrument");
    expect(ids).toContain("goto-order");
    const edit = actions.find((action) => action.id === "edit-instrument")!;
    expect(edit.command).toMatch(/^\/(sampler|spectral|percussion) \d+$/);
    expect(actions.find((action) => action.id === "goto-order")!.special).toBe(
      "order-picker",
    );
  });

  it("instrument rows offer edit tabs, duplicate and delete", () => {
    const actions = contextActions(session.getState(), {
      kind: "instrument",
      index: 0,
    });
    const ids = actions.map((action) => action.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        "sampler",
        "spectral",
        "percussion",
        "chord",
        "microtextures",
        "duplicate",
        "preview",
        "delete",
      ]),
    );
    expect(actions.find((action) => action.id === "chord")!.command).toBe(
      "/chord 0",
    );
    expect(
      actions.find((action) => action.id === "microtextures")!.command,
    ).toBe("/microtextures 0");
    expect(actions.find((action) => action.id === "delete")!.keys).toEqual([
      "del",
    ]);
    expect(actions.find((action) => action.id === "duplicate")!.command).toBe(
      "/duplicateinstrument 0",
    );
    expect(actions.find((action) => action.id === "delete")!.special).toBe(
      "delete-instrument",
    );
  });

  it("sample slots offer preview, edit, new-instrument and import", () => {
    const actions = contextActions(session.getState(), {
      kind: "sample",
      slot: 2,
    });
    const ids = actions.map((action) => action.id);
    expect(ids).toEqual(
      expect.arrayContaining(["preview", "edit", "new-instrument", "import"]),
    );
    expect(
      actions.find((action) => action.id === "new-instrument")!.command,
    ).toBe("/newinstrumentfromsample 2");
  });
});

describe("/actions command", () => {
  it("returns the same context actions the UI would show", async () => {
    const registry = createRegistry();
    const result = await registry.execute("/actions tracker", {
      session,
      listCommands: () => registry.all(),
    });
    expect(result.ok).toBe(true);
    const data = result.data as { actions: Array<{ id: string }> };
    expect(data.actions.some((action) => action.id === "audition")).toBe(true);
  });
});

describe("global undo/redo (FEAT-92)", () => {
  it("undoes and redoes an instrument add", () => {
    const before = session.song!.instruments.length;
    const index = session.addInstrument();
    expect(index).toBe(before);
    expect(session.song!.instruments.length).toBe(before + 1);
    expect(session.undo()).toBe(true);
    expect(session.song!.instruments.length).toBe(before);
    expect(session.redo()).toBe(true);
    expect(session.song!.instruments.length).toBe(before + 1);
    session.undo();
  });

  it("keeps the undo stack after an order move and restores cell edits", () => {
    session.setCursor({ order: 0, channel: 3, row: 0, column: 0 });
    const pattern = session.song!.channels[3]!.orderList[0]!;
    const original =
      session.song!.channels[3]!.patterns.get(pattern)!.rows[0]!.note;
    expect(original?.kind).toBe("note");

    session.clearCell();
    expect(
      session.song!.channels[3]!.patterns.get(pattern)!.rows[0]!.note,
    ).toBeNull();

    expect(session.moveOrder(0, 1)).toBe(true);
    // Undo the move, then the cell clear — the stack must have survived.
    expect(session.undo()).toBe(true);
    expect(session.undo()).toBe(true);
    expect(
      session.song!.channels[3]!.patterns.get(pattern)!.rows[0]!.note,
    ).toEqual(original);
  });

  it("undoes an instrument rename and a master-volume change", () => {
    session.setInstrumentName(0, "Renamed");
    expect(session.instrumentName(0)).toBe("Renamed");
    session.undo();
    expect(session.instrumentName(0)).not.toBe("Renamed");

    session.setMasterVolume(0.37);
    expect(session.getState().masterVolume).toBeCloseTo(0.37);
    session.undo();
    expect(session.getState().masterVolume).not.toBeCloseTo(0.37);
  });

  it("addInstrumentFromSample names the new instrument after the sample", () => {
    const slot = 1;
    const name = session.sampleName(slot) || `Sample ${slot}`;
    const index = session.addInstrumentFromSample(slot);
    expect(index).toBeGreaterThanOrEqual(0);
    expect(session.samplerSettings(index)?.sourceIndex).toBe(slot);
    expect(session.instrumentName(index)).toBe(name);
    // The composite is a single undo step.
    session.undo();
    expect(session.samplerSettings(index)).toBeUndefined();
  });
});
