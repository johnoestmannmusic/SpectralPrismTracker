import { render } from "ink-testing-library";
import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import { MixerOverlay } from "@/tui/components/MixerOverlay";
import { SamplesOverlay } from "@/tui/components/SamplesOverlay";
import { InstrumentsOverlay } from "@/tui/components/InstrumentsOverlay";
import { StatusBar } from "@/tui/components/StatusBar";
import {
  ParamEditorOverlay,
  initialEditText,
  parseEditText,
  type EditorParam,
} from "@/tui/components/ParamEditorOverlay";
import { HelpOverlay } from "@/tui/components/HelpOverlay";
import { createRegistry } from "@/tui/commands";
import {
  masterFxGroups,
  percussionGroups,
  samplerGroups,
  spectralGroups,
} from "@/tui/editors";
import { Session } from "@/tui/session";

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
    stdin.write("\r");
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

  it("help lists every command and reports the visible range", () => {
    const commands = createRegistry().all();
    const { lastFrame, unmount } = render(
      <HelpOverlay commands={commands} active height={30} onClose={() => {}} />,
    );
    const frame = lastFrame() ?? "";
    expect(frame).toContain(`Lantern commands (${commands.length})`);
    expect(frame).toMatch(/\d+[\u2013-]\d+ of \d+/);
    expect(frame).toContain("/clear");
    unmount();
  });

  describe("instrument list", () => {
    it("lists instruments and opens the editor on enter", async () => {
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
      stdin.write("\r");
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(onOpen).toHaveBeenCalledWith(0, "sampler");
      unmount();
    });
  });

  describe("editor tabs", () => {
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
