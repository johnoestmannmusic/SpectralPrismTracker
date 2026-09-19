import { Box, Text } from "ink";
import { useEffect, useState } from "react";

const SPINNER = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

/** A `[████░░░░]` bar for a 0..1 fraction. */
export function progressBar(fraction: number, width = 24): string {
  const clamped = Math.min(Math.max(fraction, 0), 1);
  const filled = Math.round(clamped * width);
  return `${"█".repeat(filled)}${"░".repeat(Math.max(0, width - filled))}`;
}

interface Props {
  title: string;
  label: string;
  fraction: number;
  width?: number;
}

/**
 * Modal shown for long-running TUI tasks such as WAV export (FEAT-156). The
 * spinner keeps animating between coarse progress updates so the app visibly
 * stays alive.
 */
export function ProgressModal({ title, label, fraction, width = 44 }: Props) {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setFrame((value) => value + 1), 120);
    return () => clearInterval(timer);
  }, []);
  const clamped = Math.min(Math.max(fraction, 0), 1);
  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="cyan"
      paddingX={2}
      paddingY={1}
      alignSelf="flex-start"
    >
      <Text bold color="cyan">
        {title}
      </Text>
      <Text>
        <Text color="green">{SPINNER[frame % SPINNER.length]} </Text>
        {label}
      </Text>
      <Text>
        <Text color="green">{progressBar(clamped, width)}</Text>{" "}
        {String(Math.round(clamped * 100)).padStart(3)}%
      </Text>
    </Box>
  );
}
