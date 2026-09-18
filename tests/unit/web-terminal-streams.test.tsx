import { Text, render, useInput } from "ink";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { createTerminalStreams } from "@/web/terminalStreams";

/**
 * FEAT-105 spike: prove Ink 7 accepts our hand-rolled browser streams. If this
 * passes, the xterm.js wiring only needs to pump bytes in/out of these shims.
 */
function Counter() {
  const [count, setCount] = useState(0);
  useInput((input) => {
    if (input === "a") setCount((value) => value + 1);
  });
  return <Text>count:{count}</Text>;
}

describe("browser terminal streams (FEAT-105)", () => {
  it("renders Ink output and accepts keyboard input through the shims", async () => {
    let output = "";
    const streams = createTerminalStreams({
      columns: 100,
      rows: 30,
      onOutput: (data) => {
        output += data;
      },
    });

    const instance = render(<Counter />, {
      stdout: streams.stdout as unknown as NodeJS.WriteStream,
      stdin: streams.stdin as unknown as NodeJS.ReadStream,
      exitOnCtrlC: false,
      patchConsole: false,
      // The browser has no kitty keyboard protocol to negotiate.
      kittyKeyboard: { mode: "disabled" },
    });

    await instance.waitUntilRenderFlush();
    expect(output).toContain("count:0");

    streams.stdin.push("a");
    await instance.waitUntilRenderFlush();
    expect(output).toContain("count:1");

    instance.unmount();
  });

  it("reflows when the terminal is resized", async () => {
    let resizeEvents = 0;
    const streams = createTerminalStreams({ columns: 80, rows: 24 });
    streams.stdout.on("resize", () => {
      resizeEvents += 1;
    });
    streams.stdout.resize(120, 40);
    expect(resizeEvents).toBe(1);
    expect(streams.stdout.columns).toBe(120);
    expect(streams.stdout.rows).toBe(40);
  });
});
