import { render } from "ink-testing-library";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { App } from "@/tui/App";
import { songInfoGroups } from "@/tui/editors";
import { Session } from "@/tui/session";

describe("editable Song Info menu", () => {
  const session = new Session();

  beforeAll(async () => {
    await session.init();
  }, 60_000);

  afterAll(() => {
    session.dispose();
  });

  it("exposes song, credits and timing groups", () => {
    const groups = songInfoGroups(session);
    const titles = groups.map((group) => group.title);
    expect(titles).toEqual(["Song", "Credits", "Timing"]);
    const timing = groups.find((group) => group.title === "Timing")!;
    expect(timing.params.map((param) => param.label)).toEqual([
      "BPM",
      "Beat highlight rows",
      "Bar highlight rows",
    ]);
  });

  it("setBpm retimes the song, sequence and duration", () => {
    const before = session.getState();
    const bpm = before.song!.meta.bpm;
    const firstRow = before.song!.rowTimes[1]!;
    session.setBpm(bpm + 30);
    const after = session.getState();
    expect(after.song!.meta.bpm).toBe(bpm + 30);
    expect(after.project!.bpmOverride).toBe(bpm + 30);
    expect(after.song!.rowTimes[1]).not.toBe(firstRow);
    session.setBpm(bpm);
  });

  it("setHighlight clamps bar to at least the beat and retimes", () => {
    session.setHighlight(8, 32);
    expect(session.getState().song!.meta.highlightA).toBe(8);
    expect(session.getState().song!.meta.highlightB).toBe(32);
    session.setHighlight(16, 4);
    expect(session.getState().song!.meta.highlightB).toBe(16);
  });

  it("setSongMeta persists title/credits into the project", () => {
    session.setSongMeta("album", "Unit Test Album");
    session.setSongMeta("websiteLink", "https://example.test");
    const project = session.getState().project!;
    expect(project.album).toBe("Unit Test Album");
    expect(project.websiteLink).toBe("https://example.test");
    expect(session.getState().dirty).toBe(true);
  });

  it("opens the Song Info menu when /info runs", async () => {
    const { stdin, lastFrame, unmount } = render(<App session={session} />);
    const tick = () => new Promise((resolve) => setTimeout(resolve, 20));
    stdin.write("/");
    await tick();
    for (const char of "info") {
      stdin.write(char);
      await tick();
    }
    stdin.write("\r");
    await new Promise((resolve) => setTimeout(resolve, 120));
    const frame = lastFrame() ?? "";
    expect(frame).toContain("Song Info");
    expect(frame).toContain("Timing");
    stdin.write("\x1b");
    await tick();
    unmount();
  });
});
