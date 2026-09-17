import { render } from "ink-testing-library";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { MixerOverlay } from "@/tui/components/MixerOverlay";
import { SamplesOverlay } from "@/tui/components/SamplesOverlay";
import { ParamEditorOverlay } from "@/tui/components/ParamEditorOverlay";
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
    spectral.unmount();

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
    expect(frame).toContain("Noise");
    percussion.unmount();
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
});
