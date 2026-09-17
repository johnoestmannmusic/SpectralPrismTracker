import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { defaultSamplerSettings } from "@/core/sampler";
import {
  initialEditText,
  parseEditText,
  type EditorParam,
} from "@/tui/components/ParamEditorOverlay";
import { instrumentTabFor } from "@/tui/editors";
import { Session } from "@/tui/session";

describe("instrument management", () => {
  const session = new Session();

  beforeAll(async () => {
    await session.init();
  }, 60_000);

  afterAll(() => {
    session.dispose();
  });

  it("renames an instrument and persists the name into the project", () => {
    session.setInstrumentName(0, "  Lead  ");
    expect(session.instrumentName(0)).toBe("Lead");
    expect(session.buildProjectFile()!.instrumentNames[0]).toBe("Lead");
  });

  it("adds a new default instrument", () => {
    const before = session.getState().song!.instruments.length;
    const index = session.addInstrument();
    expect(index).toBe(before);
    const state = session.getState();
    expect(state.song!.instruments).toHaveLength(before + 1);
    expect(state.settings).toHaveLength(before + 1);
    expect(session.instrumentName(index)).toBe(
      `Instrument ${String(index + 1).padStart(2, "0")}`,
    );
    expect(session.buildProjectFile()!.instrumentNames).toHaveLength(
      before + 1,
    );
    session.deleteInstrument(index);
  });

  it("deletes an instrument and drops its settings/name", () => {
    const before = session.getState().song!.instruments.length;
    expect(session.deleteInstrument(1)).toBe(true);
    const state = session.getState();
    expect(state.song!.instruments).toHaveLength(before - 1);
    expect(state.settings).toHaveLength(before - 1);
    expect(session.buildProjectFile()!.instrumentNames).toHaveLength(
      before - 1,
    );
  });

  it("resolves the instrument associated with the cursor row", () => {
    // The row's INS value wins over the channel's held instrument.
    session.setCursor({ order: 0, channel: 0, row: 0, column: 1 });
    session.editCell({ instrument: 4 });
    expect(session.instrumentAtCursor()).toBe(4);
  });

  it("refuses out-of-range and last-instrument deletes", async () => {
    expect(session.deleteInstrument(-1)).toBe(false);
    expect(session.deleteInstrument(999)).toBe(false);

    const single = new Session();
    await single.init();
    while (single.getState().song!.instruments.length > 1) {
      expect(single.deleteInstrument(0)).toBe(true);
    }
    expect(single.deleteInstrument(0)).toBe(false);
    single.dispose();
  });
}, 120_000);

describe("text editor params", () => {
  const param: EditorParam = {
    label: "Name",
    kind: "text",
    value: "Bass",
    set: () => {},
  };

  it("seeds and parses a text value", () => {
    expect(initialEditText(param)).toBe("Bass");
    expect(parseEditText(param, "  Lead  ")).toBe("Lead");
    expect(parseEditText(param, "   ")).toBeNull();
  });
});

describe("instrument editor tab routing", () => {
  it("prefers percussion, then spectral, then sampler", () => {
    const settings = defaultSamplerSettings();
    expect(instrumentTabFor(undefined)).toBe("sampler");
    expect(instrumentTabFor(settings)).toBe("sampler");
    expect(
      instrumentTabFor({
        ...settings,
        spectral: { ...settings.spectral, enabled: true },
      }),
    ).toBe("spectral");
    expect(
      instrumentTabFor({
        ...settings,
        spectral: {
          ...settings.spectral,
          enabled: true,
          percussion: { ...settings.spectral.percussion, enabled: true },
        },
      }),
    ).toBe("percussion");
  });
});
