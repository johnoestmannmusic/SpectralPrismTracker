import { Box, Text, useInput } from "ink";
import { useState } from "react";
import type { CommandDef } from "../commands/types";

interface Props {
  commands: CommandDef[];
  onClose: () => void;
  active: boolean;
  /** Rows available to the overlay (already excludes the app header/status/command bar). */
  height: number;
}

interface Line {
  kind: "header" | "command" | "spacer";
  text: string;
  secondary?: string;
}

/** EDIT MODE keyboard shortcuts (parity with the original app's help menu). */
const KEY_SHORTCUTS: Array<[string, string]> = [
  ["Arrows", "Move selection (wraps across patterns)"],
  ["Ctrl+Up/Down", "Move 16 rows (menus: skip category)"],
  ["Ctrl+Left/Right", "Jump channel (NOTE column)"],
  ["Shift+Arrows", "Extend selection"],
  ["[ / ]", "Cycle orders (previous / next)"],
  ["PgUp / PgDn", "Move order"],
  ["Z", "Enter last value / repeat"],
  ["X", "Clear cell or range"],
  ["C", "Note off"],
  ["Q / A", "Value +1 / -1"],
  ["W / S", "Note +/-1 octave"],
  ["Ctrl+Shift+C / X / V", "Copy / cut / paste"],
  ["Ctrl+Shift+F", "Flood paste to end"],
  ["Ctrl+A", "Select column / all"],
  ["Ctrl+Z / Y", "Undo / redo"],
  ["Space", "Play from pattern start / pause"],
  ["Ctrl+Space", "Play from the selected cell"],
  ["Uppercase letters", "Enter notes (Z S X D C V G B H N J M)"],
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
    for (const command of list
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))) {
      const args = (command.args ?? [])
        .map((arg) => (arg.required ? `<${arg.name}>` : `[${arg.name}]`))
        .join(" ");
      lines.push({
        kind: "command",
        text: `/${command.name}${args ? ` ${args}` : ""}`,
        secondary: command.description,
      });
    }
  }
  return lines;
}

export function HelpOverlay({ commands, onClose, active, height }: Props) {
  const [offset, setOffset] = useState(0);
  const lines = buildLines(commands);
  // One terminal row per list entry; the box adds a title, hint and 2 border rows.
  const pageSize = Math.max(4, height - 4);
  const maxOffset = Math.max(0, lines.length - pageSize);
  const clamped = Math.min(offset, maxOffset);
  const visible = lines.slice(clamped, clamped + pageSize);

  useInput(
    (char, key) => {
      if (key.escape || char === "q" || char === "x" || key.return) {
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
        Lantern commands ({commands.length})
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
            <Text dimColor>{line.secondary}</Text>
          </Text>
        );
      })}
    </Box>
  );
}
