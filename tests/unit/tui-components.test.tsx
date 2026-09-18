import { render } from "ink-testing-library";
import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import { MixerOverlay } from "@/tui/components/MixerOverlay";
import { SamplesOverlay } from "@/tui/components/SamplesOverlay";
import { InstrumentsOverlay } from "@/tui/components/InstrumentsOverlay";
import { PatternsOverlay } from "@/tui/components/PatternsOverlay";
import { PatternView } from "@/tui/components/PatternView";
import { StepPanel, marquee } from "@/tui/components/StepPanel";
import { buildSteps } from "@/core/stepthrough";
import { StatusBar } from "@/tui/components/StatusBar";
import {
  ParamEditorOverlay,
  initialEditText,
  parseEditText,
  type EditorGroup,
  type EditorParam,
} from "@/tui/components/ParamEditorOverlay";
import { HelpOverlay } from "@/tui/components/HelpOverlay";
import { createRegistry } from "@/tui/commands";
import {
  chordGroups,
  masterFxGroups,
  microtexturesGroups,
  percussionGroups,
  samplerGroups,
  spectralGroups,
  wavExportGroups,
} from "@/tui/editors";
import { Session } from "@/tui/session";
import { defaultSamplerSettings } from "@/core/sampler";

describe("TUI overlays", () => {
  const session = new Session();

  beforeAll(async () => {
    await session.init();
  }, 60_000);

  afterAll(() => {
    session.dispose();
  });

  it("renders the mixer with channels, master and FX", () => {
    const { lastFrame, unmount } = render(
      <MixerOverlay session={session} active onClose={() => {}} />,
    );
    const frame = lastFrame() ?? "";
    expect(frame).toContain("Mixer / Master FX");
    expect(frame).toContain("CH1");
    expect(frame).toContain("CH4");
    expect(frame).toContain("MASTER");
    expect(frame).toContain("DELAY");
    expect(frame).toContain("REVERB");
    unmount();
  });

  it("shows per-channel phase/speed rows in Cycles Mode", () => {
    const previous = session.getState().cyclesMode;
    session.setCyclesMode(true, false);
    try {
      const { lastFrame, unmount } = render(
        <MixerOverlay session={session} active onClose={() => {}} />,
      );
      const frame = lastFrame() ?? "";
      expect(frame).toContain("CH1 phase");
      expect(frame).toContain("CH1 speed");
      expect(frame).toContain("CH1 drift");
      unmount();
    } finally {
      session.setCyclesMode(previous, false);
    }
  });

  it("renders the source-sample browser with a waveform and instruments", () => {
    const { lastFrame, unmount } = render(
      <SamplesOverlay session={session} active onClose={() => {}} />,
    );
    const frame = lastFrame() ?? "";
    expect(frame).toContain("Source Samples");
    expect(frame).toContain("Waveform");
    expect(frame).toContain("Instruments");
    unmount();
  });

  it("edits a source sample's name and comments", async () => {
    const { stdin, lastFrame, unmount } = render(
      <SamplesOverlay session={session} active onClose={() => {}} />,
    );
    const tick = () => new Promise((resolve) => setTimeout(resolve, 10));
    stdin.write("\r"); // open the source-sample action menu
    await tick();
    stdin.write("2"); // "Rename & info…"
    await tick();
    expect(lastFrame() ?? "").toContain("Source Sample 00 — info");
    stdin.write("Kick");
    await tick();
    stdin.write("\r");
    await tick();
    stdin.write("drums");
    await tick();
    stdin.write("\r");
    await tick();
    expect(session.sampleName(0)).toContain("Kick");
    expect(session.sampleComments(0)).toContain("drums");
    unmount();
  });

  it("renders the sampler editor groups", () => {
    const { lastFrame, unmount } = render(
      <ParamEditorOverlay
        title="Sampler"
        groups={samplerGroups(session, 0)}
        active
        height={40}
        onClose={() => {}}
      />,
    );
    const frame = lastFrame() ?? "";
    expect(frame).toContain("Sampler");
    expect(frame).toContain("Waveform");
    expect(frame).toContain("Amp envelope");
    expect(frame).toContain("Attack");
    expect(frame).toContain("Transpose");
    unmount();
  });

  it("renders the spectral and percussion editors", () => {
    const before = session.samplerSettings(0)!;
    const spectral = render(
      <ParamEditorOverlay
        title="Spectral"
        groups={spectralGroups(session, 0)}
        active
        height={40}
        onClose={() => {}}
      />,
    );
    const spectralFrame = spectral.lastFrame() ?? "";
    expect(spectralFrame).toContain("Waveform");
    expect(spectralFrame).toContain("Fusion mode");
    expect(spectralFrame).toContain("Source sample");
    // Source B / the amount slider only appear for a real fusion algorithm.
    expect(spectralFrame).not.toContain("Source sample B");
    spectral.unmount();

    session.updateSamplerSetting(0, {
      spectral: { ...before.spectral, mode: "mix" },
    });
    const mixed = render(
      <ParamEditorOverlay
        title="Spectral"
        groups={spectralGroups(session, 0)}
        active
        height={40}
        onClose={() => {}}
      />,
    );
    const mixedFrame = mixed.lastFrame() ?? "";
    expect(mixedFrame).toContain("Source sample B");
    expect(mixedFrame).toContain("Mix amount");
    // The other algorithms' amount sliders are not shown.
    expect(mixedFrame).not.toContain("Convolve amount");
    expect(mixedFrame).not.toContain("Ring Modulate amount");
    mixed.unmount();
    session.updateSamplerSetting(0, { spectral: before.spectral });

    const percussion = render(
      <ParamEditorOverlay
        title="Percussion"
        groups={percussionGroups(session, 0)}
        active
        height={40}
        onClose={() => {}}
      />,
    );
    const frame = percussion.lastFrame() ?? "";
    expect(frame).toContain("Percussion");
    expect(frame).toContain("One-shot");
    // The synth controls stay hidden until Percussion is switched on.
    expect(frame).not.toContain("Noise");
    percussion.unmount();

    session.updateSamplerSetting(0, {
      spectral: {
        ...before.spectral,
        percussion: { ...before.spectral.percussion, enabled: true },
      },
    });
    const enabled = render(
      <ParamEditorOverlay
        title="Percussion"
        groups={percussionGroups(session, 0)}
        active
        height={40}
        onClose={() => {}}
      />,
    );
    expect(enabled.lastFrame() ?? "").toContain("Noise");
    enabled.unmount();
    session.updateSamplerSetting(0, { spectral: before.spectral });
  });

  it("renders the master FX editor", () => {
    const { lastFrame, unmount } = render(
      <ParamEditorOverlay
        title="Master FX"
        groups={masterFxGroups(session)}
        active
        height={40}
        onClose={() => {}}
      />,
    );
    const frame = lastFrame() ?? "";
    expect(frame).toContain("Delay");
    expect(frame).toContain("Reverb");
    unmount();
  });

  it("help lists every command and reports the visible range", async () => {
    const commands = createRegistry().all();
    const { stdin, lastFrame, unmount } = render(
      <HelpOverlay commands={commands} active height={30} onClose={() => {}} />,
    );
    const frame = lastFrame() ?? "";
    expect(frame).toContain(`Lantern commands (${commands.length})`);
    expect(frame).toMatch(/\d+[\u2013-]\d+ of \d+/);
    // The command list continues past the first page; page until /clear shows.
    for (let i = 0; i < 10 && !(lastFrame() ?? "").includes("/clear"); i++) {
      stdin.write(" ");
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    expect(lastFrame() ?? "").toContain("/clear");
    unmount();
  });

  describe("instrument list", () => {
    it("lists instruments and opens the editor with 1/2/3", async () => {
      const onOpen = vi.fn();
      const { stdin, lastFrame, unmount } = render(
        <InstrumentsOverlay
          session={session}
          active
          onClose={() => {}}
          onOpen={onOpen}
        />,
      );
      expect(lastFrame() ?? "").toContain("StringSynth 1");
      stdin.write("1");
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(onOpen).toHaveBeenCalledWith(0, "sampler");
      unmount();
    });
  });

  describe("editor tabs", () => {
    it("scrolls to the stepthrough-highlighted param", async () => {
      const { lastFrame, unmount } = render(
        <ParamEditorOverlay
          title="Sampler"
          groups={samplerGroups(session, 0)}
          active
          height={12}
          onClose={() => {}}
          highlight={[{ group: "Vibrato", label: "Depth" }]}
        />,
      );
      await new Promise((resolve) => setTimeout(resolve, 20));
      const frame = lastFrame() ?? "";
      expect(frame).toContain("◆ Depth");
      unmount();
    });

    it("renders the tabs and switches on Tab / [ / ]", async () => {
      const onSelect = vi.fn();
      const { stdin, lastFrame, unmount } = render(
        <ParamEditorOverlay
          title="Sampler"
          groups={samplerGroups(session, 0)}
          active
          height={40}
          onClose={() => {}}
          tabs={{
            labels: ["Sampler", "Spectral", "Percussion"],
            active: 0,
            onSelect,
            highlight: [false, true, false],
          }}
        />,
      );
      expect(lastFrame() ?? "").toContain("Percussion");
      expect(lastFrame() ?? "").toContain("Sampler");
      const tick = () => new Promise((resolve) => setTimeout(resolve, 10));
      stdin.write("\t");
      await tick();
      expect(onSelect).toHaveBeenLastCalledWith(1);
      stdin.write("]");
      await tick();
      expect(onSelect).toHaveBeenLastCalledWith(1);
      stdin.write("[");
      await tick();
      expect(onSelect).toHaveBeenLastCalledWith(2);
      unmount();
    });
  });

  describe("step panel", () => {
    it("marquees overflowing titles", () => {
      expect(marquee("abc", 5, 0)).toBe("abc");
      expect(marquee("abcdef", 3, 0)).toBe("abc");
      expect(marquee("abcdef", 3, 2)).toBe("cde");
    });

    it("lists the recipe and marks the current step", () => {
      const steps = buildSteps(session.snapshotTarget()!);
      expect(steps.length).toBeGreaterThan(0);
      const { lastFrame, unmount } = render(
        <StepPanel steps={steps} index={1} width={40} height={20} />,
      );
      const frame = lastFrame() ?? "";
      expect(frame).toContain("▶");
      expect(frame).toContain("2/");
      expect(frame).toContain(steps[1]!.title);
      unmount();
    });
  });

  describe("pattern manager", () => {
    it("lists orders and duplicates on d", async () => {
      const before = session.getState().song!.meta.orderLength;
      const { stdin, lastFrame, unmount } = render(
        <PatternsOverlay session={session} active onClose={() => {}} />,
      );
      expect(lastFrame() ?? "").toContain("Pattern Manager");
      stdin.write("d");
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(session.getState().song!.meta.orderLength).toBe(before + 1);
      // Restore the shared session for the remaining tests.
      session.removePatternAt(1);
      expect(session.getState().song!.meta.orderLength).toBe(before);
      unmount();
    });

    it("edits a specific channel's own order list", async () => {
      const lengthsBefore = session.channelOrderLengths();
      const channel0Before = session
        .getState()
        .song!.channels[0]!.orderList.slice();
      const { stdin, lastFrame, unmount } = render(
        <PatternsOverlay session={session} active onClose={() => {}} />,
      );
      const frame = lastFrame() ?? "";
      expect(frame).toContain("channels");
      expect(frame).toContain("LCM");

      // Move from channel 1 to channel 2, then add an order there.
      stdin.write("\u001B[C");
      await new Promise((resolve) => setTimeout(resolve, 10));
      stdin.write("a");
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(session.channelOrderLengths()[1]).toBe(lengthsBefore[1]! + 1);
      expect(session.getState().song!.channels[0]!.orderList).toEqual(
        channel0Before,
      );

      session.removeChannelOrder(1, 1);
      expect(session.channelOrderLengths()[1]).toBe(lengthsBefore[1]!);
      unmount();
    });

    it("opens pattern settings on enter and adjusts the row count", async () => {
      session.setViewOrder(0);
      const before = session.patternSlotInfo(0, 0)!.rowLength;
      const { stdin, lastFrame, unmount } = render(
        <PatternsOverlay session={session} active onClose={() => {}} />,
      );
      stdin.write("\r");
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(lastFrame() ?? "").toContain("Rows:");
      // Move from Name to Rows and bump it by one.
      stdin.write("\u001B[B");
      await new Promise((resolve) => setTimeout(resolve, 10));
      stdin.write("\u001B[C");
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(session.patternSlotInfo(0, 0)!.rowLength).toBe(before + 1);
      session.undo();
      expect(session.patternSlotInfo(0, 0)!.rowLength).toBe(before);
      unmount();
    });

    it("undoes and redoes with ctrl+z / ctrl+y", async () => {
      session.setViewOrder(0);
      const before = session.patternSlotInfo(0, 0)!.rowLength;
      const { stdin, unmount } = render(
        <PatternsOverlay session={session} active onClose={() => {}} />,
      );
      session.setPatternRowLength(0, 0, before + 4);
      expect(session.patternSlotInfo(0, 0)!.rowLength).toBe(before + 4);
      stdin.write("\u001A");
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(session.patternSlotInfo(0, 0)!.rowLength).toBe(before);
      stdin.write("\u0019");
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(session.patternSlotInfo(0, 0)!.rowLength).toBe(before + 4);
      session.undo();
      unmount();
    });

    it("selects within a short channel and moves with arrows immediately", async () => {
      session.setChannelOrderLength(2, 2);
      session.setViewOrder(4);
      session.setCursor({ channel: 2, order: 4, row: 0 });
      const titles: string[] = [];
      const { stdin, unmount } = render(
        <PatternsOverlay
          session={session}
          active
          onClose={() => {}}
          onExplain={(content) => {
            titles.push(content.title);
          }}
        />,
      );
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(titles.at(-1)).toContain("order 01");
      stdin.write("\u001B[A");
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(titles.at(-1)).toContain("order 00");
      unmount();
      session.undo();
    });

    it("opens on the tracker's current channel", () => {
      session.setCursor({ channel: 2, order: 0, row: 0 });
      let title = "";
      const { unmount } = render(
        <PatternsOverlay
          session={session}
          active
          onClose={() => {}}
          onExplain={(content) => {
            title = content.title;
          }}
        />,
      );
      expect(title).toContain("Ch 3");
      unmount();
      session.setCursor({ channel: 0, order: 0, row: 0 });
    });
  });

  describe("cycles performance view", () => {
    it("renders independent per-channel row gutters around a centred playhead", () => {
      session.setCyclesMode(true);
      const before = session.patternSlotInfo(0, 0)!.rowLength;
      // Short channel so some visible rows are blank and must not collapse the
      // column layout as the channel scrolls.
      session.setPatternRowLength(0, 0, 3);
      try {
        const { lastFrame, unmount } = render(
          <PatternView
            state={session.getState()}
            viewportRows={9}
            playhead={{ order: 0, row: 0 }}
            playheads={[
              { order: 0, row: 1 },
              { order: 0, row: 3 },
              { order: 0, row: 0 },
              { order: 0, row: 0 },
            ]}
            selection={null}
          />,
        );
        const frame = lastFrame() ?? "";
        expect(frame).toContain("Cycles");
        expect(frame).toContain("centred playhead");
        expect(frame).toContain("CH1");
        expect(frame).toContain("CH4");
        // Every header/body line must have the separators at identical columns.
        const lines = frame.split("\n").slice(1);
        const positions = lines.map((line) =>
          [...line]
            .map((ch, index) => (ch === "│" ? index : -1))
            .filter((index) => index >= 0)
            .join(","),
        );
        expect(new Set(positions).size).toBe(1);
        unmount();
      } finally {
        session.setPatternRowLength(0, 0, before);
        session.setCyclesMode(false);
      }
    });

    it("stays in the Cycles layout even when stopped", () => {
      session.setCyclesMode(true);
      try {
        const { lastFrame, unmount } = render(
          <PatternView
            state={session.getState()}
            viewportRows={9}
            playhead={null}
            playheads={null}
            selection={null}
          />,
        );
        const frame = lastFrame() ?? "";
        expect(frame).toContain("Cycles");
        expect(frame).toContain("CH1");
        expect(frame).toContain("CH4");
        unmount();
      } finally {
        session.setCyclesMode(false);
      }
    });
  });

  describe("chord instrument mode", () => {
    it("exposes shape and voicing controls when enabled", () => {
      const settings = defaultSamplerSettings();
      settings.chord.enabled = true;
      settings.chord.preset = "minor7";
      const groups = chordGroups(session, 0, settings);
      const labels = groups.flatMap((group) =>
        group.params.map((param) => param.label),
      );
      expect(labels).toContain("Shape");
      expect(labels).toContain("Inversion");
      expect(labels).toContain("Voices");
      expect(labels).toContain("Strum");
    });
  });

  describe("microtextures instrument mode", () => {
    it("exposes granular, retrigger, formant and lo-fi controls", () => {
      const settings = defaultSamplerSettings();
      settings.spectral.microTextures.enabled = true;
      const groups = microtexturesGroups(session, 0, settings);
      const labels = groups.flatMap((group) =>
        group.params.map((p) => p.label),
      );
      expect(labels).toContain("Enabled");
      expect(labels).toContain("Grain size");
      expect(labels).toContain("Density");
      expect(labels).toContain("Shift");
      expect(labels).toContain("Bit depth");
    });
  });

  describe("wav export modal", () => {
    it("adds a track length control only in Cycles Mode", () => {
      const previous = session.getState().cyclesMode;
      session.setCyclesMode(false, false);
      let labels = wavExportGroups(session).flatMap((group) =>
        group.params.map((param) => param.label),
      );
      expect(labels).toContain("Loops");
      expect(labels).toContain("Peak normalize");
      expect(labels).not.toContain("Track length");

      session.setCyclesMode(true, false);
      labels = wavExportGroups(session).flatMap((group) =>
        group.params.map((param) => param.label),
      );
      expect(labels).toContain("Track length");
      session.setCyclesMode(previous, false);
    });
  });

  describe("status bar", () => {
    it("collapses a multi-line status onto one line", () => {
      const { lastFrame, unmount } = render(
        <StatusBar status={"a\nb\nc"} error={null} hint="hint" />,
      );
      const frame = lastFrame() ?? "";
      expect(frame.split("\n")).toHaveLength(2);
      expect(frame).toContain("a · b · c");
      unmount();
    });
  });

  describe("editor tab bar", () => {
    it("renders every instrument tab label", () => {
      const { lastFrame, unmount } = render(
        <ParamEditorOverlay
          title="Spectral — Instrument"
          groups={spectralGroups(session, 0)}
          active
          onClose={() => {}}
          height={24}
          tabs={{
            labels: ["Sampler", "Spectral", "Percussion", "Chord"],
            active: 1,
            onSelect: () => {},
            highlight: [false, true, false, false],
          }}
        />,
      );
      const frame = lastFrame() ?? "";
      for (const label of ["Sampler", "Spectral", "Percussion", "Chord"]) {
        expect(frame).toContain(label);
      }
      unmount();
    });
  });

  describe("number bar", () => {
    it("clamps a value outside the slider range instead of crashing", () => {
      const param: EditorParam = {
        label: "Frequency",
        kind: "number",
        value: 8500,
        min: 100,
        max: 8000,
        step: 10,
        set: () => {},
      };
      const groups: EditorGroup[] = [{ title: "Transient", params: [param] }];
      const { lastFrame, unmount } = render(
        <ParamEditorOverlay
          title="Test"
          groups={groups}
          active
          onClose={() => {}}
          height={10}
        />,
      );
      expect(lastFrame() ?? "").toContain("Frequency");
      unmount();
    });
  });

  describe("enum chooser", () => {
    it("opens a list on enter and selects with arrows", async () => {
      const set = vi.fn();
      const choices = ["kick", "snare", "metal", "hat"];
      const param: EditorParam = {
        label: "Preset",
        kind: "enum",
        value: "snare",
        choices,
        set,
      };
      const groups: EditorGroup[] = [{ title: "Percussion", params: [param] }];
      const { stdin, lastFrame, unmount } = render(
        <ParamEditorOverlay
          title="Test"
          groups={groups}
          active
          onClose={() => {}}
          height={20}
        />,
      );
      stdin.write("\r");
      await new Promise((resolve) => setTimeout(resolve, 10));
      const frame = lastFrame() ?? "";
      expect(frame).toContain("choose Preset");
      expect(frame).toContain("metal");
      expect(frame).toContain("hat");
      // Chooser opens on the current value (snare); down + enter picks metal.
      stdin.write("\u001B[B");
      await new Promise((resolve) => setTimeout(resolve, 10));
      stdin.write("\r");
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(set).toHaveBeenCalledWith("metal");
      unmount();
    });
  });

  describe("parameter value entry", () => {
    const numberParam = (set: (value: unknown) => void): EditorParam => ({
      label: "Amount",
      kind: "number",
      value: 0,
      min: 0,
      max: 100,
      step: 1,
      integer: true,
      set: set as EditorParam["set"],
    });

    it("parses numbers, clamps to range and rejects junk", () => {
      const param = numberParam(() => {});
      expect(parseEditText(param, "42")).toBe(42);
      expect(parseEditText(param, "999")).toBe(100);
      expect(parseEditText(param, "-5")).toBe(0);
      expect(parseEditText(param, "nope")).toBeNull();
      expect(parseEditText(param, "")).toBeNull();
    });

    it("parses toggles and enum choices", () => {
      const toggle: EditorParam = {
        label: "Loop",
        kind: "toggle",
        value: false,
        set: () => {},
      };
      expect(parseEditText(toggle, "on")).toBe(true);
      expect(parseEditText(toggle, "OFF")).toBe(false);
      expect(parseEditText(toggle, "maybe")).toBeNull();
      const menu: EditorParam = {
        label: "Mode",
        kind: "enum",
        value: "off",
        choices: ["off", "mix", "cross-synth"],
        set: () => {},
      };
      expect(parseEditText(menu, "MIX")).toBe("mix");
      expect(parseEditText(menu, "2")).toBe("cross-synth");
      expect(parseEditText(menu, "nope")).toBeNull();
    });

    it("seeds the entry buffer from the current value", () => {
      expect(initialEditText(numberParam(() => {}))).toBe("0");
      expect(
        initialEditText({
          label: "X",
          kind: "toggle",
          value: true,
          set: () => {},
        }),
      ).toBe("on");
    });

    it("enter types a value and applies it", async () => {
      const set = vi.fn();
      const { stdin, unmount } = render(
        <ParamEditorOverlay
          title="Test"
          groups={[{ title: "Group", params: [numberParam(set)] }]}
          active
          height={20}
          onClose={() => {}}
        />,
      );
      const tick = () => new Promise((resolve) => setTimeout(resolve, 10));
      stdin.write("\r");
      await tick();
      stdin.write("4");
      stdin.write("2");
      await tick();
      stdin.write("\r");
      await tick();
      expect(set).toHaveBeenCalledWith(42);
      unmount();
    });
    it("ctrl+arrow changes the parameter by a larger amount", async () => {
      const set = vi.fn();
      const param = { ...numberParam(set), value: 50 };
      const { stdin, unmount } = render(
        <ParamEditorOverlay
          title="Test"
          groups={[{ title: "Group", params: [param] }]}
          active
          height={20}
          onClose={() => {}}
        />,
      );
      const tick = () => new Promise((resolve) => setTimeout(resolve, 10));
      stdin.write("\u001B[1;5C");
      await tick();
      expect(set).toHaveBeenLastCalledWith(60);
      stdin.write("\u001B[1;5D");
      await tick();
      expect(set).toHaveBeenLastCalledWith(40);
      unmount();
    });
  });
});
