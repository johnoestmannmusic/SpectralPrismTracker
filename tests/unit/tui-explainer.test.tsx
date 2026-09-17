import { render } from "ink-testing-library";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { App } from "@/tui/App";
import { ExplainerPanel, isClipping } from "@/tui/components/ExplainerPanel";
import { ParamEditorOverlay } from "@/tui/components/ParamEditorOverlay";
import { PatternView } from "@/tui/components/PatternView";
import { samplerGroups } from "@/tui/editors";
import { DEFAULT_EXPLAINER, cellExplain, explainCursor } from "@/tui/explainer";
import { Session } from "@/tui/session";

describe("TUI explainer", () => {
  it("explains an effect cell using the FX catalog", () => {
    const song = {
      meta: { tuningA4: 440 },
      instruments: [],
    } as unknown as Parameters<typeof cellExplain>[0];
    const cell = {
      note: null,
      instrument: null,
      volume: null,
      effects: [{ effect: 0x0f, value: 0x03 }],
    };
    const text = cellExplain(song, 0, 0, 0, { kind: "fx", index: 0 }, cell);
    expect(text.title).toContain("0F03");
    expect(text.body).toContain("Set Speed 2");
  });

  it("falls back to the default explainer with no song", () => {
    const session = new Session();
    expect(explainCursor(session.getState())).toEqual(DEFAULT_EXPLAINER);
  });

  it("renders the panel title and body", () => {
    const { lastFrame, unmount } = render(
      <ExplainerPanel
        content={{ title: "EXPLAINER", body: "Look here for details." }}
        width={40}
        height={10}
      />,
    );
    const frame = lastFrame() ?? "";
    expect(frame).toContain("EXPLAINER");
    expect(frame).toContain("Look here for details.");
    unmount();
  });

  it("shows CH1-CH4 + master meters and flags clipping", () => {
    expect(isClipping(1)).toBe(true);
    expect(isClipping(0.99)).toBe(false);
    const fake = {
      meterLevels: () => [0.5, 0.2, 1.2, 0.9, 1],
    } as unknown as Session;
    const { lastFrame, unmount } = render(
      <ExplainerPanel
        content={{ title: "EXPLAINER", body: "Body" }}
        width={40}
        height={14}
        session={fake}
      />,
    );
    const frame = lastFrame() ?? "";
    expect(frame).toContain("CH1");
    expect(frame).toContain("CH4");
    expect(frame).toContain("MAS");
    // CH3 and master are at/over full scale.
    expect(frame.match(/CLIP/g)?.length).toBe(2);
    unmount();
  });

  describe("with the bundled song", () => {
    const session = new Session();

    beforeAll(async () => {
      await session.init();
    }, 60_000);

    afterAll(() => {
      session.dispose();
    });

    it("explains the tracker cell under the cursor", () => {
      const text = explainCursor(session.getState());
      expect(text.title.length).toBeGreaterThan(0);
      expect(text.body.length).toBeGreaterThan(0);
    });

    it("renders the pattern view with instrument colouring on", () => {
      const { lastFrame, unmount } = render(
        <PatternView
          state={{ ...session.getState(), colorInstruments: true }}
          viewportRows={20}
          playhead={null}
          selection={null}
        />,
      );
      expect(lastFrame() ?? "").toContain("CH1");
      unmount();
    });

    it("renders the pattern view with instrument colouring off", () => {
      const { lastFrame, unmount } = render(
        <PatternView
          state={{ ...session.getState(), colorInstruments: false }}
          viewportRows={20}
          playhead={null}
          selection={null}
        />,
      );
      expect(lastFrame() ?? "").toContain("CH1");
      unmount();
    });

    it("pushes the highlighted setting to the explainer", async () => {
      const onExplain = vi.fn();
      const { stdin, unmount } = render(
        <ParamEditorOverlay
          title="Sampler"
          groups={samplerGroups(session, 0)}
          active
          height={40}
          onClose={() => {}}
          onExplain={onExplain}
        />,
      );
      expect(onExplain).toHaveBeenCalled();
      // The instrument name is the first parameter in the Sampler menu.
      expect(onExplain.mock.calls[0]?.[0].title).toContain("Instrument · Name");
      // Move down to the next parameter (Source sample) and check the panel.
      stdin.write("\u001B[B");
      await new Promise((resolve) => setTimeout(resolve, 20));
      const titles = onExplain.mock.calls.map((call) => call[0].title);
      expect(titles.some((title) => title.includes("Source sample"))).toBe(
        true,
      );
      unmount();
    });

    it("shows the menu context in the header and status bar", async () => {
      const { stdin, lastFrame, unmount } = render(<App session={session} />);
      const tick = () => new Promise((resolve) => setTimeout(resolve, 20));
      stdin.write("/");
      await tick();
      for (const char of "samples") {
        stdin.write(char);
        await tick();
      }
      stdin.write("\r");
      await new Promise((resolve) => setTimeout(resolve, 120));
      const frame = lastFrame() ?? "";
      expect(frame).toContain("Source Samples");
      expect(frame).toContain("enter edit info");
      expect(frame).not.toContain("cycle orders");
      unmount();
    });

    it("enters stepthrough, navigates and exits", async () => {
      const { stdin, lastFrame, unmount } = render(<App session={session} />);
      const tick = () => new Promise((resolve) => setTimeout(resolve, 20));
      stdin.write("/");
      await tick();
      for (const char of "stepthrough") {
        stdin.write(char);
        await tick();
      }
      stdin.write("\r");
      await new Promise((resolve) => setTimeout(resolve, 150));
      let frame = lastFrame() ?? "";
      expect(frame).toContain("↑↓ step");
      expect(frame).toContain("Step 1/");
      stdin.write("\x1b[B");
      await tick();
      frame = lastFrame() ?? "";
      expect(frame).toContain("Step 2/");
      stdin.write("\x1b");
      await new Promise((resolve) => setTimeout(resolve, 60));
      frame = lastFrame() ?? "";
      expect(frame).not.toContain("↑↓ step");
      expect(frame).toContain("space play");
      unmount();
    });
  });
});
