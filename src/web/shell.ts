/**
 * Non-TUI chrome for the web deployment (HC001/HC003).
 *
 * The TUI itself runs in the Node host and is streamed over `/api/stream`; the
 * buttons here post the equivalent slash commands to `/api/input`, so they
 * share the exact command surface the terminal uses.
 */

export interface ShellClient {
  /** Sends raw terminal input (keystrokes or a slash command). */
  send: (input: string) => void;
  /** Sends a slash command followed by Enter. */
  command: (command: string) => void;
}

export interface ShellButton {
  id: string;
  label: string;
  title: string;
  run: (client: ShellClient) => void | Promise<void>;
}

/** Triggers a browser download for a URL or Blob. */
function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  anchor.click();
  URL.revokeObjectURL(url);
}

let muted = false;

export const SHELL_BUTTONS: ShellButton[] = [
  {
    id: "toggle",
    label: "▶ / ■",
    title: "Play or stop",
    run: ({ command }) => command("/toggle"),
  },
  {
    id: "stop",
    label: "Stop",
    title: "Stop playback",
    run: ({ command }) => command("/stop"),
  },
  {
    id: "open",
    label: "Open",
    title: "Open a .lampjson project",
    run: async ({ command }) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".lampjson,application/json";
      const file = await new Promise<File | null>((resolve) => {
        input.onchange = () => resolve(input.files?.[0] ?? null);
        input.click();
      });
      if (!file) return;
      const response = await fetch(
        `/api/upload?name=${encodeURIComponent(file.name)}`,
        { method: "POST", body: file },
      );
      if (!response.ok) return;
      const data = (await response.json()) as { path?: string };
      if (data.path) command(`/open ${data.path}`);
    },
  },
  {
    id: "save",
    label: "Save",
    title: "Download the current project",
    run: async ({ command }) => {
      const response = await fetch("/api/project");
      if (!response.ok) {
        command("/save");
        return;
      }
      downloadBlob(await response.blob(), "project.lampjson");
    },
  },
  {
    id: "download",
    label: "Download",
    title: "Download the current project",
    run: async ({ command }) => {
      const response = await fetch("/api/project");
      if (!response.ok) {
        command("/save");
        return;
      }
      downloadBlob(await response.blob(), "project.lampjson");
    },
  },
  {
    id: "restore",
    label: "Restore",
    title: "Restore the autosaved backup",
    run: ({ command }) => command("/restore"),
  },
  {
    id: "mute",
    label: "Mute",
    title: "Toggle master mute",
    run: ({ command }) => {
      muted = !muted;
      command(`/mastervol ${muted ? 0 : 1}`);
    },
  },
  {
    id: "help",
    label: "Help",
    title: "Show the command list",
    run: ({ command }) => command("/help"),
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
export function installShellButtons(client: ShellClient): void {
  const host = document.getElementById("shell-buttons");
  if (!host) return;
  for (const button of SHELL_BUTTONS) {
    const element = document.createElement("button");
    element.type = "button";
    element.textContent = button.label;
    element.title = button.title;
    element.dataset.command = button.id;
    element.addEventListener("click", () => {
      void button.run(client);
      document.getElementById("terminal")?.focus();
    });
    host.append(element);
  }
}
