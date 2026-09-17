import { readdir } from "node:fs/promises";
import path from "node:path";
import { projectToJson } from "@/core/project";
import { writeBytesSafe } from "@/runtime/files";
import {
  fail,
  ok,
  type CommandArg,
  type CommandDef,
  type ParsedArgs,
} from "./types";

const pathArg: CommandArg = {
  name: "path",
  type: "path",
  complete: async (prefix) => completePath(prefix),
};

/** Directory/file completion for path args. */
export async function completePath(prefix: string): Promise<string[]> {
  const dir = prefix.endsWith("/") ? prefix : path.dirname(prefix) + "/";
  const base = prefix.endsWith("/") ? "" : path.basename(prefix);
  try {
    const entries = await readdir(dir.length ? dir : ".", {
      withFileTypes: true,
    });
    return entries
      .filter((entry) =>
        entry.name.toLowerCase().startsWith(base.toLowerCase()),
      )
      .map((entry) => `${dir}${entry.name}${entry.isDirectory() ? "/" : ""}`)
      .slice(0, 50);
  } catch {
    return [];
  }
}

function parseTime(input: string): number | null {
  const clock = /^(\d+):(\d{1,2})$/.exec(input);
  if (clock) return Number(clock[1]) * 60 + Number(clock[2]);
  const seconds = Number(input);
  return Number.isFinite(seconds) ? seconds : null;
}

function arg(args: ParsedArgs, name: string): string | undefined {
  return args.values[name];
}

export const builtinCommands: CommandDef[] = [
  {
    id: "help",
    name: "help",
    aliases: ["?"],
    description: "List all commands grouped by category",
    category: "general",
    run: (_args, ctx) => {
      const list = ctx.listCommands?.() ?? [];
      return ok(`${list.length} commands`, {
        commands: list.map((command) => ({
          id: command.id,
          name: command.name,
          aliases: command.aliases ?? [],
          description: command.description,
          category: command.category,
          args: command.args ?? [],
        })),
      });
    },
  },
  {
    id: "quit",
    name: "quit",
    aliases: ["exit", "q"],
    description: "Exit the terminal player",
    category: "general",
    run: (_args, ctx) => {
      ctx.exit?.();
      return ok("Bye");
    },
  },
  {
    id: "status",
    name: "status",
    description: "Show the current session status line",
    category: "general",
    run: (_args, ctx) => ok(ctx.session.getState().status),
  },
  {
    id: "info",
    name: "info",
    aliases: ["song"],
    description: "Show song title, author, system, tempo and length",
    category: "song",
    run: (_args, ctx) => {
      const { song } = ctx.session.getState();
      if (!song) return fail("No song loaded");
      return ok(`${song.meta.name} — ${song.meta.author}`, {
        name: song.meta.name,
        author: song.meta.author,
        system: song.meta.system,
        tickRate: song.meta.tickRate,
        patternLength: song.meta.patternLength,
        orderLength: song.meta.orderLength,
        tuningA4: song.meta.tuningA4,
        instruments: song.instruments.length,
        duration: ctx.session.getState().duration,
      });
    },
  },
  {
    id: "play",
    name: "play",
    aliases: ["p"],
    description: "Start playback from the first row of the viewed pattern",
    category: "transport",
    run: (_args, ctx) => {
      ctx.session.play();
      return ok("Playing");
    },
  },
  {
    id: "pause",
    name: "pause",
    description: "Pause playback",
    category: "transport",
    run: (_args, ctx) => {
      ctx.session.pause();
      return ok("Paused");
    },
  },
  {
    id: "stop",
    name: "stop",
    description: "Stop playback and return to the start",
    category: "transport",
    run: (_args, ctx) => {
      ctx.session.stop();
      return ok("Stopped");
    },
  },
  {
    id: "toggle",
    name: "toggle",
    description: "Toggle play/pause",
    category: "transport",
    run: (_args, ctx) => {
      ctx.session.togglePlay();
      return ok(ctx.session.getState().playing ? "Playing" : "Paused");
    },
  },
  {
    id: "seek",
    name: "seek",
    description: "Seek to a time (seconds or mm:ss)",
    category: "transport",
    args: [{ name: "time", type: "string", required: true }],
    run: (args, ctx) => {
      const time = parseTime(arg(args, "time")!);
      if (time === null) return fail("Seek needs seconds or mm:ss");
      ctx.session.seek(time);
      return ok(`Seek ${time.toFixed(2)}s`);
    },
  },
  {
    id: "goto",
    name: "goto",
    aliases: ["order"],
    description: "Jump the view (and playhead) to an order, optionally a row",
    category: "tracker",
    args: [
      { name: "order", type: "number", required: true },
      { name: "row", type: "number" },
    ],
    run: (args, ctx) => {
      const order = Number(arg(args, "order"));
      const row = arg(args, "row") !== undefined ? Number(arg(args, "row")) : 0;
      if (!Number.isFinite(order)) return fail("order must be a number");
      if (!Number.isFinite(row)) return fail("row must be a number");
      ctx.session.seekTo(order, row);
      ctx.session.setCursor({ order, row });
      return ok(`Order ${order} row ${row}`);
    },
  },
  {
    id: "channel",
    name: "channel",
    aliases: ["ch"],
    description: "Select a channel (0-3)",
    category: "tracker",
    args: [{ name: "index", type: "number", required: true }],
    run: (args, ctx) => {
      const index = Number(arg(args, "index"));
      if (!Number.isFinite(index))
        return fail("channel index must be a number");
      ctx.session.setCursor({ channel: index });
      return ok(`Channel ${index}`);
    },
  },
  {
    id: "mode",
    name: "mode",
    description: "Switch playback mode (sampler | chip)",
    category: "transport",
    args: [
      {
        name: "mode",
        type: "enum",
        required: true,
        choices: ["sampler", "chip"],
      },
    ],
    run: (args, ctx) => {
      const mode = arg(args, "mode");
      if (mode !== "sampler" && mode !== "chip")
        return fail("mode must be sampler or chip");
      ctx.session.setMode(mode);
      return ok(`Mode: ${mode}`);
    },
  },
  {
    id: "note",
    name: "note",
    aliases: ["n"],
    description: "Enter a note at the cursor (e.g. C-4, or OFF)",
    category: "edit",
    args: [{ name: "name", type: "string", required: true }],
    run: (args, ctx) => {
      const value = ctx.session.noteNameToValue(arg(args, "name")!);
      if (!value) return fail("Note must look like C-4, F#3 or OFF");
      ctx.session.editCell({ note: value });
      return ok(`Note ${arg(args, "name")}`);
    },
  },
  {
    id: "instrument",
    name: "instrument",
    aliases: ["ins"],
    description: "Set the instrument on the cursor cell",
    category: "edit",
    args: [{ name: "index", type: "number", required: true }],
    run: (args, ctx) => {
      const index = Number(arg(args, "index"));
      if (!Number.isFinite(index))
        return fail("instrument index must be a number");
      ctx.session.editCell({ instrument: index });
      return ok(`Instrument ${index}`);
    },
  },
  {
    id: "clear",
    name: "clear",
    aliases: ["del"],
    description: "Clear the cursor column in the current row",
    category: "edit",
    run: (_args, ctx) => {
      ctx.session.clearCell();
      return ok("Cleared");
    },
  },
  {
    id: "undo",
    name: "undo",
    aliases: ["u"],
    description: "Undo the last pattern edit",
    category: "edit",
    run: (_args, ctx) =>
      ctx.session.undo() ? ok("Undo") : fail("Nothing to undo"),
  },
  {
    id: "redo",
    name: "redo",
    description: "Redo the last undone pattern edit",
    category: "edit",
    run: (_args, ctx) =>
      ctx.session.redo() ? ok("Redo") : fail("Nothing to redo"),
  },
  {
    id: "octave",
    name: "octave",
    aliases: ["oct"],
    description: "Set the default entry octave (0-8)",
    category: "edit",
    args: [{ name: "value", type: "number", required: true }],
    run: (args, ctx) => {
      const value = Number(arg(args, "value"));
      if (!Number.isFinite(value)) return fail("octave must be a number");
      ctx.session.setLastOctave(value);
      return ok(`Octave ${ctx.session.lastOctaveValue}`);
    },
  },
  {
    id: "mute",
    name: "mute",
    description: "Mute a channel (0-3) or the master",
    category: "mixer",
    args: [{ name: "channel", type: "number" }],
    run: (args, ctx) => {
      const raw = arg(args, "channel");
      if (raw === undefined) {
        ctx.session.setMasterVolume(0);
        return ok("Master muted");
      }
      const channel = Number(raw);
      if (!Number.isFinite(channel)) return fail("channel must be a number");
      ctx.session.setChannelMute(channel, true);
      return ok(`Channel ${channel} muted`);
    },
  },
  {
    id: "unmute",
    name: "unmute",
    description: "Unmute a channel (0-3) or the master",
    category: "mixer",
    args: [{ name: "channel", type: "number" }],
    run: (args, ctx) => {
      const raw = arg(args, "channel");
      if (raw === undefined) {
        ctx.session.setMasterVolume(1);
        return ok("Master unmuted");
      }
      const channel = Number(raw);
      if (!Number.isFinite(channel)) return fail("channel must be a number");
      ctx.session.setChannelMute(channel, false);
      return ok(`Channel ${channel} unmuted`);
    },
  },
  {
    id: "volume",
    name: "volume",
    aliases: ["vol"],
    description: "Set a channel volume (0-1)",
    category: "mixer",
    args: [
      { name: "channel", type: "number", required: true },
      { name: "value", type: "number", required: true },
    ],
    run: (args, ctx) => {
      const channel = Number(arg(args, "channel"));
      const value = Number(arg(args, "value"));
      if (!Number.isFinite(channel) || !Number.isFinite(value))
        return fail("channel and value must be numbers");
      ctx.session.setChannelVolume(channel, value);
      return ok(`Channel ${channel} volume ${value}`);
    },
  },
  {
    id: "mastervol",
    name: "mastervol",
    aliases: ["master"],
    description: "Set the master volume (0-1)",
    category: "mixer",
    args: [{ name: "value", type: "number", required: true }],
    run: (args, ctx) => {
      const value = Number(arg(args, "value"));
      if (!Number.isFinite(value)) return fail("value must be a number");
      ctx.session.setMasterVolume(value);
      return ok(`Master volume ${value}`);
    },
  },
  {
    id: "meters",
    name: "meters",
    description: "Print current channel and master peak levels",
    category: "mixer",
    run: (_args, ctx) => {
      const levels = ctx.session.meterLevels();
      return ok(levels.map((level) => level.toFixed(3)).join("  "), { levels });
    },
  },
  {
    id: "samples",
    name: "samples",
    aliases: ["src"],
    description: "List source samples with names and durations",
    category: "samples",
    run: (_args, ctx) => {
      const { sampleNames } = ctx.session.getState();
      const durations = ctx.session.backend?.sampleDurations() ?? [];
      const rows = sampleNames.map((name, index) => ({
        index,
        name: name || `(sample ${index})`,
        duration: durations[index] ?? 0,
      }));
      return ok(
        rows
          .map((row) => `${row.index}: ${row.name} ${row.duration.toFixed(2)}s`)
          .join("\n"),
        { samples: rows },
      );
    },
  },
  {
    id: "preview",
    name: "preview",
    aliases: ["audition"],
    description: "Audition a source sample by index",
    category: "samples",
    args: [{ name: "index", type: "number", required: true }],
    run: (args, ctx) => {
      const index = Number(arg(args, "index"));
      if (!Number.isFinite(index)) return fail("sample index must be a number");
      ctx.session.backend?.previewSample(index);
      return ok(`Preview sample ${index}`);
    },
  },
  {
    id: "save",
    name: "save",
    aliases: ["write"],
    description: "Save the project as .lampjson",
    category: "file",
    args: [pathArg],
    run: async (args, ctx) => {
      const project = ctx.session.getState().project;
      if (!project) return fail("No project loaded");
      const target = arg(args, "path") ?? "project.lampjson";
      const json = projectToJson(project, true);
      const written = await writeBytesSafe(
        target,
        new TextEncoder().encode(json),
      );
      if (!written.ok) return fail(written.error);
      ctx.session.setStatus(`Saved ${written.value}`);
      return ok(`Saved ${written.value}`, { path: written.value });
    },
  },
  {
    id: "reference",
    name: "reference",
    aliases: ["ref"],
    description: "Toggle the reference-pitch audition tone",
    category: "transport",
    args: [{ name: "state", type: "enum", choices: ["on", "off", "toggle"] }],
    run: (args, ctx) => {
      const state = arg(args, "state") ?? "toggle";
      const next =
        state === "toggle" ? !ctx.session.getState().reference : state === "on";
      ctx.session.setReference(next);
      return ok(`Reference ${next ? "on" : "off"}`);
    },
  },
];
