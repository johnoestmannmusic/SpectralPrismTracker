import "@xterm/xterm/css/xterm.css";
import "./styles.css";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import { downloadBlob, installShellButtons, type ShellClient } from "./shell";

/**
 * Web entrypoint (HC003).
 *
 * Renders the SpectralPrism Tracker TUI, streamed from the local Node host over
 * SSE, inside
 * an xterm.js frame with extra non-TUI buttons. Input is POSTed back to the
 * host, so the browser and the desktop app share one implementation.
 */

function terminalOptions() {
  return {
    // Ink emits full frames as lines joined by `\n` and relies on the terminal
    // doing a carriage return (a real TTY's ONLCR). xterm.js only does that
    // with convertEol, so without it every streamed row drifts right (FEAT-154).
    convertEol: true,
    cursorBlink: true,
    fontFamily: '"JetBrains Mono", "Fira Code", Menlo, Consolas, monospace',
    fontSize: 15,
    // Whole-pixel cell metrics keep Ink's row/column maths aligned (FEAT-154).
    lineHeight: 1,
    letterSpacing: 0,
    scrollback: 2000,
    theme: {
      background: "#07090c",
      foreground: "#c7f2d4",
      cursor: "#7dffa8",
      selectionBackground: "#1d3a2a",
      black: "#07090c",
      green: "#7dffa8",
      yellow: "#ffe08a",
      cyan: "#8ad7ff",
      red: "#ff7d7d",
      white: "#d7ffe6",
    },
  };
}

function main(): void {
  const container = document.getElementById("terminal");
  if (!container) throw new Error("missing #terminal");

  const terminal = new Terminal(terminalOptions());
  const fit = new FitAddon();
  terminal.loadAddon(fit);
  terminal.open(container);

  // Serialise input POSTs: HTTP allows concurrent requests, but terminal input
  // must arrive in order (and Ink parses one keypress per chunk).
  let inputChain: Promise<unknown> = Promise.resolve();
  const enqueue = (body: string, path = "/api/input"): void => {
    inputChain = inputChain
      .then(() => fetch(path, { method: "POST", body }))
      .catch(() => undefined);
  };
  /** Sends text one character per request so Ink sees individual keypresses. */
  const sendInput = (text: string): void => {
    for (const char of text) enqueue(char);
  };

  const client: ShellClient = {
    send: sendInput,
    command: (command) => sendInput(`${command}\r`),
    downloadWav: () => void downloadWav(),
    focus: () => terminal.focus(),
  };

  terminal.onData((data) => sendInput(data));

  // Fit and tell the host our size. Re-fit once the monospace webfont has
  // loaded and whenever the container's layout changes, otherwise the host
  // keeps its initial row count and the TUI leaves blank rows (FEAT-161).
  // De-duplicate so a re-fit that does not change the size is a no-op.
  let lastSize = "";
  const syncSize = (): void => {
    fit.fit();
    const key = `${terminal.cols}x${terminal.rows}`;
    if (key === lastSize) return;
    lastSize = key;
    enqueue(
      JSON.stringify({ cols: terminal.cols, rows: terminal.rows }),
      "/api/resize",
    );
  };
  syncSize();
  if (typeof document !== "undefined" && document.fonts?.ready) {
    void document.fonts.ready.then(() => syncSize());
  }
  if (typeof ResizeObserver !== "undefined") {
    const observer = new ResizeObserver(() => syncSize());
    observer.observe(container);
  }
  requestAnimationFrame(() => syncSize());
  window.addEventListener("resize", () => syncSize());

  // Stream the TUI output from the host.
  const source = new EventSource("/api/stream");
  source.onmessage = (event) => {
    terminal.write(JSON.parse(event.data as string) as string);
  };
  source.onerror = () => {
    terminal.write(
      "\r\n\x1b[31m[web] Lost connection to the SpectralPrism host.\x1b[0m\r\n",
    );
  };

  const shell = installShellButtons(client);

  // Test/debug hook: exposes the rendered screen text for E2E assertions.
  (window as unknown as Record<string, unknown>).__lanternScreenText = () => {
    const buffer = terminal.buffer.active;
    let out = "";
    for (let i = 0; i < buffer.length; i++) {
      out += `${buffer.getLine(i)?.translateToString(true) ?? ""}\n`;
    }
    return out;
  };

  const statusElement = document.getElementById("shell-status");
  const licenseElement = document.getElementById("shell-licenses");
  const poll = async (): Promise<void> => {
    try {
      const response = await fetch("/api/status");
      if (response.ok && statusElement) {
        const state = (await response.json()) as {
          playing: boolean;
          name: string;
          time: number;
          duration: number;
          dirty: boolean;
          stepthrough?: boolean;
          musicLicense?: string;
          codeLicense?: string;
        };
        const icon = state.playing ? "▶" : "■";
        statusElement.textContent = `${icon} ${state.name} · ${formatClock(state.time)} / ${formatClock(state.duration)}${state.dirty ? " · ●" : ""}`;
        shell.setStepthrough(!!state.stepthrough);
        shell.setPlaying(!!state.playing);
        if (licenseElement) {
          const parts: string[] = [];
          if (state.musicLicense) parts.push(`Music: ${state.musicLicense}`);
          if (state.codeLicense) parts.push(`Code: ${state.codeLicense}`);
          licenseElement.textContent = parts.join(" · ");
        }
      }
    } catch {
      if (statusElement) statusElement.textContent = "host offline";
    }
  };
  void poll();
  setInterval(() => void poll(), 1000);

  terminal.focus();
}

/** Downloads the bundled demo WAV from the host (web has no filesystem). */
async function downloadWav(): Promise<void> {
  try {
    const response = await fetch("/api/download-wav");
    if (!response.ok) return;
    const disposition = response.headers.get("content-disposition") ?? "";
    const name = /filename="([^"]+)"/.exec(disposition)?.[1] ?? "demo.wav";
    downloadBlob(await response.blob(), name);
  } catch {
    /* ignore: the status bar keeps working */
  }
}

function formatClock(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(total / 60);
  return `${minutes}:${String(total % 60).padStart(2, "0")}`;
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  const status = document.getElementById("shell-status");
  if (status) status.textContent = `Error: ${message}`;
  console.error(error);
}
