import { Box, Text } from "ink";
import { useEffect, useState } from "react";
import type { BuildStep } from "@/core/stepthrough";

interface Props {
  steps: BuildStep[];
  index: number;
  width: number;
  height: number;
}

const CHAPTERS: Array<{ prefix: string; label: string }> = [
  { prefix: "song.", label: "Song" },
  { prefix: "sample.", label: "Source samples" },
  { prefix: "instrument.", label: "Instruments" },
  { prefix: "mixer.", label: "Mixer" },
  { prefix: "fx.", label: "Master FX" },
  { prefix: "pattern.", label: "Patterns" },
];

function chapterOf(step: BuildStep): string {
  const match = CHAPTERS.find((chapter) => step.id.startsWith(chapter.prefix));
  return match?.label ?? "Build";
}

type Row =
  | { kind: "header"; text: string }
  | { kind: "step"; step: BuildStep; stepIndex: number };

/** Horizontal marquee window into `text`, wrapping around with a gap. */
export function marquee(text: string, width: number, offset: number): string {
  if (text.length <= width) return text;
  const full = `${text}   `;
  const position = offset % full.length;
  return (full + full).slice(position, position + width);
}

/**
 * Right-hand STEPTHROUGH list ("Stepthrough Recipe"). App owns navigation,
 * this is display-only.
 */
export function StepPanel({ steps, index, width, height }: Props) {
  const current = steps[Math.min(Math.max(index, 0), steps.length - 1)];
  const [tick, setTick] = useState(0);
  // Drives the marquee for the current step's title when it overflows.
  useEffect(() => {
    const timer = setInterval(() => setTick((value) => value + 1), 130);
    return () => clearInterval(timer);
  }, []);
  // Restart the marquee when the selection changes.
  useEffect(() => setTick(0), [index]);
  const rows: Row[] = [];
  let lastChapter = "";
  steps.forEach((step, stepIndex) => {
    const chapter = chapterOf(step);
    if (chapter !== lastChapter) {
      rows.push({ kind: "header", text: chapter });
      lastChapter = chapter;
    }
    rows.push({ kind: "step", step, stepIndex });
  });
  const currentRow = Math.max(
    rows.findIndex((row) => row.kind === "step" && row.stepIndex === index),
    0,
  );
  // Budget: border (2) + title + hint, then the list.
  const visible = Math.max(3, height - 4);
  let start = 0;
  if (currentRow >= visible) start = currentRow - visible + 1;
  start = Math.min(start, Math.max(0, rows.length - visible));
  const window = rows.slice(start, start + visible);

  return (
    <Box
      flexDirection="column"
      width={width}
      height={height}
      flexShrink={0}
      borderStyle="round"
      borderColor="cyan"
      paddingX={1}
      overflow="hidden"
    >
      <Text bold color="cyan" wrap="truncate-end">
        Stepthrough Recipe
      </Text>
      <Text dimColor wrap="truncate-end">
        {index + 1}/{steps.length} · {current ? chapterOf(current) : ""} · ↑↓
        step · [ ] chapter · esc
      </Text>
      <Box flexDirection="column">
        {window.map((row, offset) => {
          const rowIndex = start + offset;
          if (row.kind === "header") {
            return (
              <Text key={`h-${rowIndex}`} bold color="cyan" wrap="truncate-end">
                {row.text.toUpperCase()}
              </Text>
            );
          }
          const isCurrent = row.stepIndex === index;
          const prefix = `${isCurrent ? "▶ " : "  "}${String(
            row.stepIndex + 1,
          ).padStart(2, "0")} `;
          const innerWidth = Math.max(6, width - 4);
          const space = Math.max(4, innerWidth - prefix.length);
          const title = isCurrent
            ? marquee(row.step.title, space, tick)
            : row.step.title;
          return (
            <Text
              key={row.step.id}
              color={isCurrent ? "black" : undefined}
              backgroundColor={isCurrent ? "white" : undefined}
              wrap="truncate-end"
            >
              {prefix}
              {title}
            </Text>
          );
        })}
      </Box>
    </Box>
  );
}
