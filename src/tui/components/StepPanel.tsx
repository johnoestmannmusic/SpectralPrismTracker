import { Box, Text } from "ink";
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

/**
 * Right-hand STEPTHROUGH list. Replaces the Explainer panel while the mode is
 * active; App owns navigation, this is display-only.
 */
export function StepPanel({ steps, index, width, height }: Props) {
  const current = steps[Math.min(Math.max(index, 0), steps.length - 1)];
  // Budget: border (2) + title + hint, then the list.
  const visible = Math.max(3, height - 4);
  let start = 0;
  if (index >= visible) start = index - visible + 1;
  start = Math.min(start, Math.max(0, steps.length - visible));
  const window = steps.slice(start, start + visible);

  return (
    <Box
      flexDirection="column"
      width={width}
      height={height}
      borderStyle="round"
      borderColor="cyan"
      paddingX={1}
      overflow="hidden"
    >
      <Text bold color="cyan" wrap="truncate-end">
        STEPTHROUGH · {index + 1}/{steps.length}
      </Text>
      <Text dimColor wrap="truncate-end">
        {current ? chapterOf(current) : ""} · ↑↓ step · esc exit
      </Text>
      <Box flexDirection="column">
        {window.map((step, offset) => {
          const stepIndex = start + offset;
          const isCurrent = stepIndex === index;
          return (
            <Text
              key={step.id}
              color={isCurrent ? "black" : undefined}
              backgroundColor={isCurrent ? "white" : undefined}
              wrap="truncate-end"
            >
              {isCurrent ? "▶ " : "  "}
              {String(stepIndex + 1).padStart(2, "0")} {step.title}
            </Text>
          );
        })}
      </Box>
    </Box>
  );
}
