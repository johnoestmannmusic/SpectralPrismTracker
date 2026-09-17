import { readdir } from "node:fs/promises";
import path from "node:path";
import { extensionOf, fileExists } from "@/runtime/files";
import { readConfig, writeConfig } from "@/runtime/config";
import {
  exportCoverPng,
  exportMidi,
  exportSamplesZip,
  exportStepRecipe,
  exportWav,
  newProject,
  openPath,
  saveProject,
} from "../io";
import { backupPath, restoreBackup } from "../autosave";
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
    id: "socket",
    name: "socket",
    aliases: ["control"],
    description: "Show the live control socket path for scripts/agents",
    category: "general",
    run: (_args, ctx) => {
      const path = ctx.session.getState().controlPath;
      return path ? ok(path, { path }) : fail("Control socket is disabled");
    },
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
    id: "follow",
    name: "follow",
    description: "Toggle tracker follow-playhead mode",
    category: "tracker",
    args: [{ name: "state", type: "enum", choices: ["on", "off", "toggle"] }],
    run: (args, ctx) => {
      const state = arg(args, "state") ?? "toggle";
      const next =
        state === "toggle" ? !ctx.session.getState().follow : state === "on";
      ctx.session.setFollow(next);
      return ok(`Follow ${next ? "on" : "off"}`);
    },
  },
  {
    id: "colors",
    name: "colors",
    aliases: ["tint"],
    description: "Toggle instrument colouring of pattern cells",
    category: "tracker",
    args: [{ name: "state", type: "enum", choices: ["on", "off", "toggle"] }],
    run: (args, ctx) => {
      const state = arg(args, "state") ?? "toggle";
      const next =
        state === "toggle"
          ? !ctx.session.getState().colorInstruments
          : state === "on";
      ctx.session.setColorInstruments(next);
      return ok(`Instrument colours ${next ? "on" : "off"}`);
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
    id: "setinstrument",
    name: "setinstrument",
    aliases: ["ins", "setins"],
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
    id: "instruments",
    name: "instruments",
    aliases: ["ilist"],
    description: "List instruments and edit their sampler/spectral/percussion",
    category: "edit",
    run: (_args, ctx) => {
      ctx.openOverlay?.("instruments");
      const { song } = ctx.session.getState();
      const count = song?.instruments.length ?? 0;
      return ok(`Instruments (${count})`, { instruments: count });
    },
  },
  {
    id: "addinstrument",
    name: "addinstrument",
    aliases: ["addins"],
    description: "Append a new default instrument",
    category: "edit",
    run: (_args, ctx) => {
      const index = ctx.session.addInstrument();
      return index >= 0
        ? ok(`Added instrument ${index}`, { instrument: index })
        : fail("No song loaded");
    },
  },
  {
    id: "delinstrument",
    name: "delinstrument",
    aliases: ["delins", "removeinstrument"],
    description: "Delete an instrument and remap its pattern references",
    category: "edit",
    args: [{ name: "index", type: "number", required: true }],
    run: (args, ctx) => {
      const index = Number(arg(args, "index"));
      if (!Number.isInteger(index))
        return fail("instrument index must be an integer");
      return ctx.session.deleteInstrument(index)
        ? ok(`Deleted instrument ${index}`)
        : fail(
            "Cannot delete that instrument (missing, the last one, or no song)",
          );
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
    id: "mixer",
    name: "mixer",
    aliases: ["mix"],
    description: "Open the channel/master mixer and Master FX controls",
    category: "mixer",
    run: (_args, ctx) => {
      ctx.openOverlay?.("mixer");
      return ok("Mixer");
    },
  },
  {
    id: "fx",
    name: "fx",
    aliases: ["masterfx"],
    description: "Edit the master delay and reverb",
    category: "mixer",
    run: (_args, ctx) => {
      ctx.openOverlay?.("fx");
      return ok("Master FX");
    },
  },
  {
    id: "sampler",
    name: "sampler",
    aliases: ["smp"],
    description: "Edit instrument sampler params (source, ADSR, tuning)",
    category: "edit",
    args: [{ name: "instrument", type: "number" }],
    run: (args, ctx) => {
      const index =
        arg(args, "instrument") !== undefined
          ? Number(arg(args, "instrument"))
          : ctx.session.getState().cursor.channel;
      if (!Number.isFinite(index)) return fail("instrument must be a number");
      ctx.openOverlay?.("sampler", index);
      return ok(`Sampler ${index}`);
    },
  },
  {
    id: "spectral",
    name: "spectral",
    aliases: ["sp"],
    description: "Edit spectral fusion params for an instrument",
    category: "edit",
    args: [{ name: "instrument", type: "number" }],
    run: (args, ctx) => {
      const index =
        arg(args, "instrument") !== undefined
          ? Number(arg(args, "instrument"))
          : ctx.session.getState().cursor.channel;
      if (!Number.isFinite(index)) return fail("instrument must be a number");
      ctx.openOverlay?.("spectral", index);
      return ok(`Spectral ${index}`);
    },
  },
  {
    id: "percussion",
    name: "percussion",
    aliases: ["perc", "drum"],
    description: "Edit the percussion post-stage for an instrument",
    category: "edit",
    args: [{ name: "instrument", type: "number" }],
    run: (args, ctx) => {
      const index =
        arg(args, "instrument") !== undefined
          ? Number(arg(args, "instrument"))
          : ctx.session.getState().cursor.channel;
      if (!Number.isFinite(index)) return fail("instrument must be a number");
      ctx.openOverlay?.("percussion", index);
      return ok(`Percussion ${index}`);
    },
  },
  {
    id: "query",
    name: "query",
    aliases: ["get"],
    description: "Read session state as JSON (e.g. /query transport.playing)",
    category: "general",
    args: [{ name: "path", type: "string" }],
    run: (args, ctx) => {
      const path = arg(args, "path") ?? "";
      const value = ctx.session.query(path);
      return ok(JSON.stringify(value), { path, value });
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
    id: "sourcesamples",
    name: "sourcesamples",
    aliases: ["samples", "src"],
    description: "List source samples with names and durations",
    category: "samples",
    run: (_args, ctx) => {
      ctx.openOverlay?.("samples");
      const { sampleNames } = ctx.session.getState();
      const durations = ctx.session.backend?.sampleDurations() ?? [];
      const rows = sampleNames.map((name, index) => ({
        index,
        name: name || `(sample ${index})`,
        duration: durations[index] ?? 0,
      }));
      return ok(`Source samples (${rows.length})`, { samples: rows });
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
  {
    id: "step",
    name: "step",
    description:
      "Set how many rows to advance after entering a value (0 = stay)",
    category: "edit",
    args: [{ name: "rows", type: "number", required: true }],
    run: (args, ctx) => {
      const rows = Number(arg(args, "rows"));
      if (!Number.isFinite(rows)) return fail("step must be a number");
      ctx.session.setStep(rows);
      return ok(`Step ${ctx.session.getState().step}`);
    },
  },
  {
    id: "select",
    name: "select",
    aliases: ["sel"],
    description:
      "Start/clear a block selection at the cursor (also E then arrows, or Shift+arrows)",
    category: "edit",
    run: (args, ctx) => {
      if (args.flags.clear) {
        ctx.session.clearSelection();
        return ok("Selection cleared");
      }
      ctx.session.clearSelection();
      ctx.session.extendSelection({ row: 1 });
      ctx.session.moveCursor({ row: -1 });
      const rect = ctx.session.selection();
      return ok(
        rect ? `Selected rows ${rect.rowLo}-${rect.rowHi}` : "Selected",
      );
    },
  },
  {
    id: "copy",
    name: "copy",
    aliases: ["yank"],
    description: "Copy the selected block (or cursor cell) to the clipboard",
    category: "edit",
    run: (_args, ctx) =>
      ctx.session.copySelection()
        ? ok("Copied")
        : fail("Select a block first (E then arrows, or Shift+arrows)"),
  },
  {
    id: "cut",
    name: "cut",
    description: "Copy the selected block and clear it",
    category: "edit",
    run: (_args, ctx) =>
      ctx.session.cutSelection() ? ok("Cut") : fail("Nothing selected"),
  },
  {
    id: "paste",
    name: "paste",
    aliases: ["put"],
    description: "Paste at the cursor (--flood repeats to the end)",
    category: "edit",
    run: (args, ctx) =>
      ctx.session.pasteSelection(!!args.flags.flood)
        ? ok("Pasted")
        : fail("Clipboard is empty"),
  },
  {
    id: "transpose",
    name: "transpose",
    aliases: ["tp"],
    description: "Transpose selected notes by semitones (default +1)",
    category: "edit",
    args: [{ name: "semitones", type: "number" }],
    run: (args, ctx) => {
      const delta =
        arg(args, "semitones") !== undefined
          ? Number(arg(args, "semitones"))
          : 1;
      if (!Number.isFinite(delta)) return fail("semitones must be a number");
      return ctx.session.transposeSelection(delta)
        ? ok(`Transposed ${delta > 0 ? "+" : ""}${delta}`)
        : fail("Select a block first");
    },
  },
  {
    id: "interpolate",
    name: "interpolate",
    aliases: ["interp"],
    description:
      "Linearly interpolate each selected column between its endpoints",
    category: "edit",
    run: (_args, ctx) =>
      ctx.session.interpolateSelection()
        ? ok("Interpolated")
        : fail("Select at least two rows"),
  },
  {
    id: "insert",
    name: "insert",
    description:
      "Insert a new order after the current one (--clone duplicates it)",
    category: "edit",
    run: (args, ctx) =>
      ctx.session.insertPattern(!!args.flags.clone)
        ? ok("Inserted order")
        : fail("No song"),
  },
  {
    id: "remove",
    name: "remove",
    aliases: ["delorder"],
    description: "Remove the current order",
    category: "edit",
    run: (_args, ctx) =>
      ctx.session.removePattern()
        ? ok("Removed order")
        : fail("Cannot remove the last order"),
  },
  {
    id: "patterns",
    name: "patterns",
    aliases: ["patternmanager", "pm"],
    description:
      "Open the Pattern Manager (add/duplicate/remove/re-arrange orders)",
    category: "edit",
    run: (_args, ctx) => {
      ctx.openOverlay?.("patterns");
      const orders = ctx.session.getState().song?.meta.orderLength ?? 0;
      return ok(`Pattern Manager (${orders} orders)`, { orders });
    },
  },
  {
    id: "move",
    name: "move",
    aliases: ["moveorder"],
    description: "Re-arrange: move an order up or down",
    category: "edit",
    args: [
      {
        name: "direction",
        type: "enum",
        required: true,
        choices: ["up", "down"],
      },
      { name: "order", type: "number" },
    ],
    run: (args, ctx) => {
      const direction =
        arg(args, "direction") === "up"
          ? -1
          : arg(args, "direction") === "down"
            ? 1
            : null;
      if (direction === null) return fail("direction must be up or down");
      const order =
        arg(args, "order") !== undefined
          ? Number(arg(args, "order"))
          : ctx.session.getState().viewOrder;
      if (!Number.isFinite(order)) return fail("order must be a number");
      return ctx.session.moveOrder(order, direction)
        ? ok(`Moved order ${order} ${arg(args, "direction")}`)
        : fail("Cannot move further");
    },
  },
  {
    id: "stepthrough",
    name: "stepthrough",
    aliases: ["walkthrough", "steps"],
    description: "Guided step-by-step rebuild of the loaded project",
    category: "view",
    args: [{ name: "state", type: "enum", choices: ["on", "off"] }],
    run: (args, ctx) => {
      if (arg(args, "state") === "off") {
        ctx.openOverlay?.("stepthrough", -1);
        return ok("Stepthrough off");
      }
      ctx.openOverlay?.("stepthrough");
      return ok("Stepthrough");
    },
  },
  {
    id: "stepexport",
    name: "stepexport",
    aliases: ["steprecipe"],
    description: "Export the stepthrough rebuild recipe as JSON",
    category: "view",
    args: [pathArg],
    run: async (args, ctx) => {
      const target = arg(args, "path");
      if (!target) return fail("stepexport needs a path");
      const result = await exportStepRecipe(ctx.session, target);
      return result.ok
        ? ok(result.message, { path: result.path })
        : fail(result.error ?? "Export failed");
    },
  },
  {
    id: "setpattern",
    name: "setpattern",
    aliases: ["pat"],
    description: "Point an order at a specific pattern number (channel 0)",
    category: "edit",
    args: [
      { name: "order", type: "number", required: true },
      { name: "pattern", type: "number", required: true },
    ],
    run: (args, ctx) => {
      const order = Number(arg(args, "order"));
      const pattern = Number(arg(args, "pattern"));
      if (!Number.isFinite(order) || !Number.isFinite(pattern))
        return fail("order and pattern must be numbers");
      return ctx.session.setOrderPatternNumber(order, pattern)
        ? ok(`Order ${order} → pattern ${pattern}`)
        : fail("Cannot set pattern");
    },
  },
  {
    id: "clearall",
    name: "clearall",
    description: "Clear every pattern in the song",
    category: "edit",
    run: (_args, ctx) =>
      ctx.session.clearAllPatterns()
        ? ok("Cleared all patterns")
        : fail("No song"),
  },
  {
    id: "lastvalue",
    name: "lastvalue",
    aliases: ["lv"],
    description: "Write the last-entered value for this column at the cursor",
    category: "edit",
    run: (_args, ctx) => {
      ctx.session.applyLastValue();
      return ok("Applied last value");
    },
  },
  {
    id: "history",
    name: "history",
    description: "List (or recall) recent commands",
    category: "general",
    args: [{ name: "index", type: "number" }],
    run: (args, ctx) => {
      const history = ctx.session.getState().commandHistory;
      if (arg(args, "index") !== undefined) {
        const index = Number(arg(args, "index"));
        const recalled = history[history.length - 1 - index];
        return recalled
          ? ok(recalled, { command: recalled })
          : fail("No such history entry");
      }
      return ok(history.slice(-10).join("\n") || "(no history)", { history });
    },
  },
  {
    id: "open",
    name: "open",
    aliases: ["load"],
    description: "Open a .lampjson project file",
    category: "file",
    args: [pathArg],
    run: async (args, ctx) => {
      const target = arg(args, "path");
      if (!target) return fail("/open requires a file path");
      const result = await openPath(ctx.session, target);
      return result.ok
        ? ok(result.message)
        : fail(result.error ?? "Open failed");
    },
  },
  {
    id: "new",
    name: "new",
    description: "Start a fresh default project",
    category: "file",
    run: async (_args, ctx) => {
      const result = await newProject(ctx.session);
      return result.ok ? ok(result.message) : fail(result.error ?? "Failed");
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
      const target = arg(args, "path") ?? "project.lampjson";
      const result = await saveProject(ctx.session, target);
      return result.ok
        ? ok(result.message, { path: result.path })
        : fail(result.error ?? "Save failed");
    },
  },
  {
    id: "restore",
    name: "restore",
    description: "Reload the autosaved backup (default backup.lmpjson)",
    category: "file",
    args: [pathArg],
    run: async (args, ctx) => {
      const target = arg(args, "path") ?? backupPath();
      const result = await restoreBackup(ctx.session, target);
      return result.ok
        ? ok(result.message)
        : fail(result.error ?? "Restore failed");
    },
  },
  {
    id: "default-open-override",
    name: "default-open-override",
    aliases: ["defaultopen", "startup"],
    description: "Set the startup file (path), or 'off' / 'last'",
    category: "file",
    args: [{ name: "value", type: "string" }],
    run: async (args) => {
      const value = arg(args, "value");
      if (!value) {
        const config = await readConfig();
        const open = config.defaultOpen;
        const current =
          open?.mode === "file" ? open.path : (open?.mode ?? "last");
        return ok(`Default open: ${current}`);
      }
      const lower = value.toLowerCase();
      if (lower === "off") {
        await writeConfig({ defaultOpen: { mode: "off" } });
        return ok("Default open: off (always the bundled default)");
      }
      if (lower === "last") {
        await writeConfig({ defaultOpen: { mode: "last" } });
        return ok("Default open: last opened project");
      }
      const resolved = path.resolve(value);
      if (!(await fileExists(resolved)))
        return fail(`No such file: ${resolved}`);
      await writeConfig({ defaultOpen: { mode: "file", path: resolved } });
      return ok(`Default open: ${resolved}`);
    },
  },
  {
    id: "export",
    name: "export",
    description: "Export the song (wav | mid | zip | png)",
    category: "file",
    args: [
      {
        name: "format",
        type: "enum",
        required: true,
        choices: ["wav", "mid", "zip", "png"],
      },
      pathArg,
    ],
    run: async (args, ctx) => {
      const format = (arg(args, "format") ?? "wav").toLowerCase();
      const song = ctx.session.getState().song;
      const base =
        arg(args, "path") ??
        (song ? song.meta.name.replace(/[^\w.-]+/g, "_") : "export");
      const lower = base.toLowerCase();
      const target = extensionOf(lower)
        ? base
        : `${base}.${format === "mid" ? "mid" : format}`;
      if (format === "wav") {
        const loops =
          args.flags.loops !== undefined ? Number(args.flags.loops) : 0;
        const fadeOutMs =
          args.flags.fade !== undefined ? Number(args.flags.fade) : 0;
        const result = await exportWav(ctx.session, target, {
          loops: Number.isFinite(loops) ? loops : 0,
          fadeOutMs: Number.isFinite(fadeOutMs) ? fadeOutMs : 0,
          normalize: !!args.flags.normalize,
        });
        return result.ok
          ? ok(result.message, { path: result.path })
          : fail(result.error ?? "Export failed");
      }
      if (format === "mid") {
        const result = await exportMidi(ctx.session, target);
        return result.ok
          ? ok(result.message, { path: result.path })
          : fail(result.error ?? "Export failed");
      }
      if (format === "zip") {
        const result = await exportSamplesZip(ctx.session, target);
        return result.ok
          ? ok(result.message, { path: result.path })
          : fail(result.error ?? "Export failed");
      }
      if (format === "png") {
        const result = await exportCoverPng(ctx.session, target);
        return result.ok
          ? ok(result.message, { path: result.path })
          : fail(result.error ?? "Export failed");
      }
      return fail(`Unsupported export format: ${format}`);
    },
  },
];
