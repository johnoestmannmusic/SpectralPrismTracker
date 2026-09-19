import { Box, Text, useInput } from "ink";
import { useState } from "react";
import type { CommandDef } from "../commands/types";
import { isCancel } from "../keys";
import { MarqueeText } from "./Marquee";

interface Props {
  commands: CommandDef[];
  onClose: () => void;
  active: boolean;
  /** Rows available to the overlay (already excludes the app header/status/command bar). */
  height: number;
  /** Columns available to the overlay (for marqueeing long descriptions). */
  width?: number;
}

interface Line {
  kind: "header" | "command" | "spacer";
  text: string;
  secondary?: string;
}

/**
 * EDIT MODE keyboard shortcuts (FEAT-148). Kept in one place next to the shared
 * key predicates so the help text can never drift from the implementation.
 */
const KEY_SHORTCUTS: Array<[string, string]> = [
  ["Arrows", "Move the cursor / extend the selection in selection mode"],
  ["Ctrl+Up/Down", "Move 16 rows (menus: skip category)"],
  ["Ctrl+Left/Right", "Jump channel (NOTE column)"],
  ["Enter", "Open the context-action menu for the cursor cell"],
  ["E", "Visual selection: arrows extend · E again copies"],
  ["T", "Cut the highlighted block"],
  ["R / Shift+R", "Paste / flood-paste to end of pattern"],
  ["v", "Edit the cell's instrument (SAMPLER-CORE/Spectral/…)"],
  ["I", "Open the Instruments panel (list of every instrument)"],
  ["O", "Go to order… (jump picker)"],
  ["L", "Loop the viewed order / the whole song"],
  ["C", "Toggle Cycles Mode (per-project workspace)"],
  ["Shift+Arrows", "Extend selection (some terminals capture this to scroll)"],
  ["[ / ]", "Cycle orders (previous / next)"],
  ["PgUp / PgDn", "Move order"],
  ["z", "Place the last value · confirm (z) inside menus"],
  ["x", "Clear cell/range · cancel (x) inside menus"],
  ["c", "Note off"],
  ["q / a", "Value +1 / -1"],
  ["w / s", "Value +12 / -12 (coarse)"],
  ["Ctrl+C / X / V", "Copy / cut / paste"],
  ["Ctrl+Shift+F", "Flood paste to end"],
  ["Ctrl+A", "Select column / all"],
  ["Del", "Delete / remove in list menus (instruments, patterns, samples)"],
  ["D / A", "Duplicate / add in those menus"],
  [
    "Ctrl+Z / Y",
    "Undo / redo (patterns, orders, instruments, mixer, workspace)",
  ],
  ["Ctrl+S", "Save the current project"],
  ["Ctrl+Shift+S", "Save As to a new path"],
  ["Space", "Play from pattern start / pause"],
  ["Ctrl+Space", "Play from the selected cell (channel-aware under Cycles)"],
  ["Stepthrough ↑↓", "Move one step · ←→ move 10 steps"],
  ["Stepthrough Ctrl+↑↓", "Previous / next category (PgUp/PgDn too)"],
  ["Stepthrough Home/End", "First / last step · Esc exits"],
  [
    "/quit or /exit",
    "Quit (Ctrl+C no longer quits; prompts on unsaved changes)",
  ],
];

function buildLines(commands: CommandDef[]): Line[] {
  const categories = new Map<string, CommandDef[]>();
  for (const command of commands) {
    const list = categories.get(command.category) ?? [];
    list.push(command);
    categories.set(command.category, list);
  }
  const lines: Line[] = [];
  lines.push({ kind: "header", text: "keys (edit mode)" });
  for (const [key, description] of KEY_SHORTCUTS) {
    lines.push({ kind: "command", text: key, secondary: description });
  }
  for (const [category, list] of Array.from(categories.entries()).sort((a, b) =>
    a[0].localeCompare(b[0]),
  )) {
    lines.push({ kind: "spacer", text: "" });
    lines.push({ kind: "header", text: category });
    for (const command of list.slice().sort((a, b) => {
      // /stepthrough leads its category (FEAT-148).
      if (category === "Stepthrough Mode") {
        if (a.id === "stepthrough") return -1;
        if (b.id === "stepthrough") return 1;
      }
      return a.name.localeCompare(b.name);
    })) {
      const args = (command.args ?? [])
        .map((arg) => (arg.required ? `<${arg.name}>` : `[${arg.name}]`))
        .join(" ");
      // Surface aliases (e.g. /exit for /quit) so they are discoverable.
      const aliases = (command.aliases ?? [])
        .filter((alias) => alias !== "?")
        .map((alias) => `/${alias}`);
      lines.push({
        kind: "command",
        text: `/${command.name}${args ? ` ${args}` : ""}`,
        secondary: `${command.description}${
          aliases.length ? ` · aliases: ${aliases.join(", ")}` : ""
        }`,
      });
    }
  }
  return lines;
}

export function HelpOverlay({
  commands,
  onClose,
  active,
  height,
  width = 100,
}: Props) {
  const [offset, setOffset] = useState(0);
  const lines = buildLines(commands);
  // One terminal row per list entry; the box adds a title, hint and 2 border rows.
  const pageSize = Math.max(4, height - 4);
  const maxOffset = Math.max(0, lines.length - pageSize);
  const clamped = Math.min(offset, maxOffset);
  const visible = lines.slice(clamped, clamped + pageSize);

  useInput(
    (char, key) => {
      if (isCancel(char, key) || char === "q") {
        onClose();
        return;
      }
      if (key.downArrow || char === "j") {
        if (key.ctrl) {
          const next = lines.findIndex(
            (line, lineIndex) => line.kind === "header" && lineIndex > clamped,
          );
          if (next >= 0) setOffset(Math.min(maxOffset, next));
          return;
        }
        setOffset((value) => Math.min(maxOffset, value + 1));
        return;
      }
      if (key.upArrow || char === "k") {
        if (key.ctrl) {
          let previous = -1;
          for (let lineIndex = 0; lineIndex < clamped; lineIndex++) {
            if (lines[lineIndex]!.kind === "header") previous = lineIndex;
          }
          if (previous >= 0) setOffset(Math.max(0, previous));
          return;
        }
        setOffset((value) => Math.max(0, value - 1));
        return;
      }
      if (key.pageDown || char === " ") {
        setOffset((value) => Math.min(maxOffset, value + pageSize));
        return;
      }
      if (key.pageUp) {
        setOffset((value) => Math.max(0, value - pageSize));
      }
    },
    { isActive: active },
  );

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="green"
      paddingX={1}
      flexGrow={1}
    >
      <Text bold color="green">
        SpectralPrism Tracker commands ({commands.length})
      </Text>
      <Text dimColor>
        ↑↓/jk scroll · ctrl+↑↓ category · space/PgDn page · esc close ·{" "}
        {clamped + 1}–{Math.min(clamped + pageSize, lines.length)} of{" "}
        {lines.length}
      </Text>
      {visible.map((line, index) => {
        const key = `${clamped}-${index}`;
        if (line.kind === "spacer") return <Text key={key}> </Text>;
        if (line.kind === "header") {
          return (
            <Text key={key} bold color="cyan">
              {line.text}
            </Text>
          );
        }
        return (
          <Text key={key} wrap="truncate-end">
            <Text color="green">{line.text.padEnd(28)}</Text>
            <MarqueeText
              dimColor
              width={Math.max(10, width - 30)}
              text={line.secondary ?? ""}
            />
          </Text>
        );
      })}
    </Box>
  );
}
