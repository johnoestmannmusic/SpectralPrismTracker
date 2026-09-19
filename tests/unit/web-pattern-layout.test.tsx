import { render } from "ink";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setHost } from "@/host";
import { nodeHost } from "@/host/node";
import { patternGridWidth } from "@/core/tracker";
import { App } from "@/tui/App";
import { Session } from "@/tui/session";
import { createTerminalStreams } from "@/web/terminalStreams";

/**
 * Regression: the web streamed TUI asked Ink to render the Explainer panel
 * beside a pattern grid that is wider than the space left over. Ink does not
 * clip overflowing rows, so the grid overran the panel and left blank "gap
 * rows" at fixed screen positions (BUG: horizontal gap rows in the web pattern
 * editor). The panel must yield whenever it would crowd out the pattern.
 */

const ESC = String.fromCharCode(27);
const ANSI = new RegExp(`${ESC}\\[[0-9;?]*[A-Za-z]`, "g");

/** Renders App with the same stdout shim the web host uses and returns the
 *  last full frame with ANSI stripped. */
async function renderFrame(
  session: Session,
  columns: number,
  rows: number,
): Promise<string[]> {
  let output = "";
  const streams = createTerminalStreams({
    columns,
    rows,
    onOutput: (data) => {
      output += data;
    },
  });
  const instance = render(<App session={session} />, {
    stdout: streams.stdout as unknown as NodeJS.WriteStream,
    stdin: streams.stdin as unknown as NodeJS.ReadStream,
    exitOnCtrlC: false,
    patchConsole: false,
  });
  await new Promise((resolve) => setTimeout(resolve, 300));
  await instance.waitUntilRenderFlush();
  instance.unmount();

  const frames = output.split("\u001b[?2026h");
  const last = frames[frames.length - 1] ?? output;
  return last.replace(ANSI, "").split("\n");
}

describe("streamed pattern layout (BUG: web gap rows)", () => {
  const session = new Session();
  beforeAll(async () => {
    setHost(nodeHost);
    await session.init();
  }, 120_000);
  afterAll(() => session.dispose());

  it("hides the Explainer panel instead of overflowing the pattern grid", async () => {
    const columns = 115;
    const lines = await renderFrame(session, columns, 37);

    // The panel is chrome; the pattern is the product. It must be dropped when
    // it would not leave room for the grid.
    expect(lines.some((line) => line.includes("levels"))).toBe(false);
    // No row may overrun the terminal (overflow is what caused the gap rows).
    expect(Math.max(...lines.map((line) => line.length))).toBeLessThanOrEqual(
      columns,
    );
    // A full-frame render at this size must not leave all-blank rows behind.
    expect(lines.filter((line) => line.trim() === "")).toHaveLength(0);
  });

  it("keeps the panel when the terminal is wide enough", async () => {
    const lines = await renderFrame(session, 160, 37);
    expect(lines.some((line) => line.includes("levels"))).toBe(true);
    expect(Math.max(...lines.map((line) => line.length))).toBeLessThanOrEqual(
      160,
    );
  });

  it("computes the natural grid width from channels and Cycles gutters", () => {
    const song = session.getState().song!;
    const tracker = patternGridWidth(song, 4, false);
    const cycles = patternGridWidth(song, 4, true);
    expect(tracker).toBeGreaterThan(0);
    // Cycles Mode repeats the row-number gutter per channel.
    expect(cycles).toBe(tracker + 4 * 3);
  });
});
