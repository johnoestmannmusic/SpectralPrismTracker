import { Box, Text } from "ink";
import { useEffect, useState } from "react";
import type { ExplainerText } from "../explainer";
import type { Session } from "../session";

interface Props {
  content: ExplainerText;
  width: number;
  height: number;
  /** When supplied, live channel/master meters are shown at the bottom. */
  session?: Session;
}

/** Peak at/above full scale counts as clipping (the meter turns red). */
export function isClipping(level: number): boolean {
  return level >= 1;
}

/** One meter row: label, block bar, peak value, and a CLIP marker. */
function MeterRow({
  label,
  level,
  width,
}: {
  label: string;
  level: number;
  width: number;
}) {
  const clipping = isClipping(level);
  const filled = Math.round(Math.min(Math.max(level, 0), 1) * width);
  const color = clipping ? "red" : "green";
  return (
    <Text>
      <Text color={color} bold={clipping}>
        {label.padEnd(4)}
      </Text>
      <Text color={color}>
        {"█".repeat(filled)}
        {"░".repeat(Math.max(0, width - filled))}
      </Text>
      <Text dimColor={!clipping} color={clipping ? "red" : undefined}>
        {" "}
        {level.toFixed(2)}
      </Text>
      {clipping ? (
        <Text color="red" bold>
          {" "}
          CLIP
        </Text>
      ) : null}
    </Text>
  );
}

/**
 * Persistent right-hand explainer, the TUI equivalent of the original app's
 * sidebar card. It shows what the current selection (tracker cell or menu row)
 * represents, replacing pointer hover with cursor-driven updates. The bottom
 * shows live CH1–CH4 + master peak meters.
 */
export function ExplainerPanel({ content, width, height, session }: Props) {
  const [levels, setLevels] = useState<number[]>(() =>
    session ? session.meterLevels() : [],
  );

  useEffect(() => {
    if (!session) return;
    const timer = setInterval(() => setLevels(session.meterLevels()), 100);
    return () => clearInterval(timer);
  }, [session]);

  const barWidth = Math.max(8, width - 20);
  const labels = ["CH1", "CH2", "CH3", "CH4", "MAS"];
  return (
    <Box
      flexDirection="column"
      width={width}
      height={height}
      borderStyle="round"
      borderColor="cyan"
      paddingX={1}
      overflow="hidden"
      alignSelf="flex-start"
    >
      <Text bold color="cyan" wrap="wrap">
        {content.title}
      </Text>
      <Box flexDirection="column" flexGrow={1} overflow="hidden">
        <Text wrap="wrap">{content.body}</Text>
      </Box>
      {session ? (
        <Box flexDirection="column" flexShrink={0}>
          <Text dimColor>levels</Text>
          {labels.map((label, index) => (
            <MeterRow
              key={label}
              label={label}
              level={levels[index] ?? 0}
              width={barWidth}
            />
          ))}
        </Box>
      ) : null}
    </Box>
  );
}

export type { ExplainerText };
