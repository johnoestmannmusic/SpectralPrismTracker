import { Box, Text, useInput, useWindowSize } from "ink";
import { useState } from "react";
import { renderWaveform } from "../format";
import type { Session } from "../session";
import { useSession } from "../hooks";

interface Props {
  session: Session;
  active: boolean;
  onClose: () => void;
}

/** Source-sample browser with an ASCII waveform and per-instrument assignment. */
export function SamplesOverlay({ session, active, onClose }: Props) {
  const state = useSession(session);
  const { columns } = useWindowSize();
  const [index, setIndex] = useState(0);

  const names = state.sampleNames;
  const durations = session.sampleDurations();
  const selected = Math.min(index, Math.max(names.length - 1, 0));
  const waveform = session.sampleWaveform(selected);
  const width = Math.max(20, Math.min(columns - 6, 100));

  useInput(
    (char, key) => {
      if (key.escape || char === "q") {
        onClose();
        return;
      }
      if (key.upArrow) {
        setIndex((value) => Math.max(0, value - 1));
        return;
      }
      if (key.downArrow) {
        setIndex((value) =>
          names.length === 0
            ? 0
            : Math.max(0, Math.min(names.length - 1, value + 1)),
        );
        return;
      }
      if (char === "p" || key.return) {
        session.backend?.previewSample(selected);
      }
    },
    { isActive: active },
  );

  const instruments = state.song?.instruments ?? [];
  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="magenta"
      paddingX={1}
    >
      <Text bold color="magenta">
        Source Samples
      </Text>
      <Text dimColor>↑↓ select · p/enter preview · esc close</Text>
      <Box flexDirection="column">
        {names.map((name, sampleIndex) => {
          const cursor = sampleIndex === selected;
          return (
            <Box key={sampleIndex}>
              <Text
                color={cursor ? "black" : undefined}
                backgroundColor={cursor ? "white" : undefined}
              >
                {String(sampleIndex).padStart(2, "0")}
              </Text>
              <Text>
                {" "}
                {(name || `(sample ${sampleIndex})`).padEnd(20)}{" "}
                {(durations[sampleIndex] ?? 0).toFixed(2)}s
              </Text>
            </Box>
          );
        })}
      </Box>
      <Box flexDirection="column" marginTop={1}>
        <Text
          dimColor
        >{`Waveform: ${names[selected] || `sample ${selected}`}`}</Text>
        <Text color="green">{renderWaveform(waveform, width)}</Text>
      </Box>
      <Box flexDirection="column" marginTop={1}>
        <Text bold color="cyan">
          Instruments
        </Text>
        {instruments.slice(0, 12).map((instrument, instrumentIndex) => {
          const setting = state.settings[instrumentIndex];
          const source = setting?.sourceIndex ?? null;
          return (
            <Text key={instrumentIndex} dimColor>
              {String(instrumentIndex).padStart(2, "0")}{" "}
              {instrument.name.padEnd(18)}{" "}
              {setting?.spectral.enabled
                ? "spectral"
                : source !== null
                  ? `src ${source}`
                  : "—"}
              {setting?.muted ? " (muted)" : ""}
            </Text>
          );
        })}
      </Box>
    </Box>
  );
}
