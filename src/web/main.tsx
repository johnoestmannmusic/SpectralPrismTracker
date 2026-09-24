import "@xterm/xterm/css/xterm.css";
import "./styles.css";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import { render } from "ink";
import { setHost } from "@/host";
import { browserHost } from "@/host/browser";
import { saveBackup, restoreBackup } from "@/tui/autosave";
import { App } from "@/tui/App";
import { Session } from "@/tui/session";
import { downloadBlob, installShellButtons, type ShellClient } from "./shell";
import { setShimSink } from "./shims/sink";
import { createTerminalStreams } from "./terminalStreams";

/**
 * Web entrypoint (HC005).
 *
 * The whole tracker runs in this page: the browser Host, the Session, and the
 * Ink TUI rendered into a local xterm.js terminal. A plain static file host
 * serves the bundle, so every visitor gets an independent instance — there is
 * no shared Node terminal, no SSE stream and no server-side session.
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

  const streams = createTerminalStreams({
    columns: terminal.cols,
    rows: terminal.rows,
    onOutput: (data) => terminal.write(data),
  });
  // Ink and its dependencies also write to `process.stdout` directly; route
  // those through the same terminal.
  setShimSink((data) => terminal.write(data));

  setHost(browserHost);
  const session = new Session();
  const instance = render(<App session={session} />, {
    stdout: streams.stdout as unknown as NodeJS.WriteStream,
    stdin: streams.stdin as unknown as NodeJS.ReadStream,
    exitOnCtrlC: false,
    patchConsole: false,
  });

  // Keyboard input goes straight into the local Ink instance.
  terminal.onData((data) => streams.stdin.push(data));
  terminal.onResize(({ cols, rows }) =>
    streams.stdout.resize(Math.max(cols, 20), Math.max(rows, 8)),
  );

  // Fit and tell Ink the current size. Re-fit once the monospace webfont has
  // loaded and whenever the container's layout changes, otherwise the TUI
  // leaves blank rows (FEAT-161).
  const syncSize = (): void => {
    fit.fit();
    streams.stdout.resize(terminal.cols, terminal.rows);
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

  // Boot the local session: bundled project + browser host + optional WASM.
  void (async () => {
    try {
      // Load the Prism WASM glue lazily so it stays out of the initial chunk.
      const { initPrismWasmBrowser } = await import("@/host/browser/prism");
      if (await initPrismWasmBrowser()) session.markWasmReady();
      session.setWebMode(true);
      session.setAutosaveHook(() => {
        void saveBackup(session);
      });
      await session.init();
      // Resume the visitor's own browser autosave when one exists — the desktop
      // reopens the last project the same way. Falls back to the bundled demo.
      const restored = await restoreBackup(session);
      if (restored.ok) {
        session.setStatus(restored.message ?? "Restored your previous session");
      }
    } catch (error) {
      session.setError(
        `Failed to start: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  })();

  // Shell chrome drives the same command surface as the terminal. Ink reads
  // one chunk per `readable` event, so feed text one character per tick;
  // synchronous bursts would be dropped.
  let sendSeq = 0;
  const sendText = (text: string): void => {
    for (const char of text) {
      const delay = sendSeq++ * 5;
      setTimeout(() => streams.stdin.push(char), delay);
    }
  };
  const client: ShellClient = {
    send: sendText,
    command: (command) => sendText(`${command}\r`),
    downloadWav: () => void downloadWav(),
    focus: () => terminal.focus(),
  };
  const shell = installShellButtons(client);

  const statusElement = document.getElementById("shell-status");
  const licenseElement = document.getElementById("shell-licenses");
  const updateStatus = (): void => {
    const state = session.getState();
    if (statusElement) {
      const icon = state.playing ? "▶" : "■";
      const name = state.song?.meta.name ?? "SpectralPrism Tracker";
      statusElement.textContent = `${icon} ${name} · ${formatClock(state.time)} / ${formatClock(state.duration)}${state.dirty ? " · ●" : ""}`;
    }
    shell.setStepthrough(!!state.stepthrough);
    shell.setPlaying(!!state.playing);
    if (licenseElement) {
      const parts: string[] = [];
      if (state.project?.musicLicense)
        parts.push(`Music: ${state.project.musicLicense}`);
      if (state.project?.codeLicense)
        parts.push(`Code: ${state.project.codeLicense}`);
      licenseElement.textContent = parts.join(" · ");
    }
  };
  session.subscribe(updateStatus);
  updateStatus();
  setInterval(updateStatus, 1000);

  // Audio contexts need a user gesture before they can start.
  const resumeAudio = (): void => session.resumeAudio();
  window.addEventListener("pointerdown", resumeAudio, { once: true });
  window.addEventListener("keydown", resumeAudio, { once: true });

  // Test/debug hook: exposes the rendered screen text for E2E assertions.
  (window as unknown as Record<string, unknown>).__lanternScreenText = () => {
    const buffer = terminal.buffer.active;
    let out = "";
    for (let i = 0; i < buffer.length; i++) {
      out += `${buffer.getLine(i)?.translateToString(true) ?? ""}\n`;
    }
    return out;
  };

  window.addEventListener("beforeunload", () => {
    instance.unmount();
    session.dispose();
  });

  terminal.focus();
}

/** Downloads a bundled demo WAV (the web has no filesystem). */
async function downloadWav(): Promise<void> {
  const base = import.meta.env?.BASE_URL ?? "/";
  const root = base.endsWith("/") ? base : `${base}/`;
  try {
    let name = "HYPERMART02.wav";
    const manifest = await fetch(`${root}assets/WAVExport/manifest.json`);
    if (manifest.ok) {
      const data = (await manifest.json()) as { files?: string[] };
      if (data.files?.[0]) name = data.files[0];
    }
    const response = await fetch(
      `${root}assets/WAVExport/${encodeURIComponent(name)}`,
    );
    if (!response.ok) return;
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
