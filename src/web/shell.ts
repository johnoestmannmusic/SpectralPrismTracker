/**
 * Non-TUI chrome for the web deployment (HC001/HC003).
 *
 * The TUI runs entirely in this page (HC005): the buttons here call the
 * in-process Session/command surface through the same stdin channel the local
 * terminal uses, so they share the exact command surface the TUI exposes.
 */

import { PROJECT_URL } from "@/shared/links";

export interface ShellClient {
  /** Sends raw terminal input (keystrokes or a slash command). */
  send: (input: string) => void;
  /** Sends a slash command followed by Enter. */
  command: (command: string) => void;
  /** Downloads the bundled demo WAV (no filesystem access on web). */
  downloadWav: () => void;
  /** Focuses the xterm terminal so keyboard input reaches the TUI. */
  focus: () => void;
}

export interface ShellButton {
  id: string;
  label: string;
  title: string;
  run: (client: ShellClient) => void | Promise<void>;
}

/** Lets the status poll keep the Play/Stop and Stepthrough labels in sync. */
export interface ShellController {
  setStepthrough(active: boolean): void;
  setPlaying(active: boolean): void;
}

/** Triggers a browser download for a URL or Blob. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  anchor.click();
  URL.revokeObjectURL(url);
}

let stepthroughActive = false;
let playingActive = false;

export const SHELL_BUTTONS: ShellButton[] = [
  {
    id: "toggle",
    label: "Play",
    title: "Play or stop",
    run: () => {
      /* handled specially so the label can follow playback state */
    },
  },
  {
    id: "stepthrough",
    label: "Stepthrough",
    title: "Start or exit the project stepthrough",
    run: () => {
      /* handled specially so the label can toggle and Esc can exit */
    },
  },
  {
    id: "download-wav",
    label: "Download WAV",
    title: "Download the bundled demo WAV",
    run: ({ downloadWav }) => downloadWav(),
  },
  {
    id: "help",
    label: "Help",
    title: "Show the command list",
    run: ({ command }) => command("/help"),
  },
  {
    id: "view-source",
    label: "View Source",
    title: "Open the source repository in a new tab",
    run: () => {
      window.open(PROJECT_URL, "_blank", "noopener,noreferrer");
    },
  },
  {
    id: "fullscreen",
    label: "Full",
    title: "Toggle fullscreen",
    run: () => {
      if (document.fullscreenElement) void document.exitFullscreen();
      else void document.documentElement.requestFullscreen();
    },
  },
];

/** Renders the buttons and wires them to the shared command surface. */
export function installShellButtons(client: ShellClient): ShellController {
  const host = document.getElementById("shell-buttons");
  const elements = new Map<string, HTMLButtonElement>();
  if (!host) return { setStepthrough: () => {}, setPlaying: () => {} };

  const setStepthrough = (active: boolean): void => {
    stepthroughActive = active;
    const element = elements.get("stepthrough");
    if (element) {
      element.textContent = active ? "Exit Stepthrough" : "Stepthrough";
      element.dataset.active = active ? "true" : "false";
    }
  };

  const setPlaying = (active: boolean): void => {
    playingActive = active;
    const element = elements.get("toggle");
    if (element) {
      element.textContent = active ? "Stop" : "Play";
      element.dataset.active = active ? "true" : "false";
    }
  };

  for (const button of SHELL_BUTTONS) {
    const element = document.createElement("button");
    element.type = "button";
    element.textContent = button.label;
    element.title = button.title;
    element.dataset.command = button.id;
    element.addEventListener("click", () => {
      if (button.id === "toggle") {
        // One button: Play when stopped, Stop while playing.
        if (playingActive) {
          client.command("/stop");
          setPlaying(false);
        } else {
          client.command("/play");
          setPlaying(true);
        }
      } else if (button.id === "stepthrough") {
        if (stepthroughActive) {
          // Stepthrough mode captures input, so send Esc to leave it.
          client.send("\x1b");
          setStepthrough(false);
        } else {
          client.command("/stepthrough");
          setStepthrough(true);
        }
      } else {
        void button.run(client);
      }
      client.focus();
    });
    elements.set(button.id, element);
    host.append(element);
  }
  setStepthrough(false);
  setPlaying(false);
  return { setStepthrough, setPlaying };
}
