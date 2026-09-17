import { Box, Text, useInput } from "ink";
import { useEffect, useState } from "react";
import { useSession } from "../hooks";
import { instrumentExplain, type ExplainerText } from "../explainer";
import type { Session, SessionState } from "../session";

export type InstrumentTab = "sampler" | "spectral" | "percussion";

interface Props {
  session: Session;
  active: boolean;
  onClose: () => void;
  /** Opens the editor for an instrument on the chosen tab. */
  onOpen: (index: number, tab: InstrumentTab) => void;
  onExplain?: (content: ExplainerText) => void;
  /** Height available to the overlay (for list scrolling). */
  height?: number;
  /** Preview state supplied by stepthrough (defaults to the live session). */
  state?: SessionState;
  /** Stepthrough instrument to mark. */
  highlightInstrument?: number;
}

/** Instrument list: pick an instrument, then edit its settings in tabs. */
export function InstrumentsOverlay({
  session,
  active,
  onClose,
  onOpen,
  onExplain,
  height,
  state: stateOverride,
  highlightInstrument,
}: Props) {
  const live = useSession(session);
  const state = stateOverride ?? live;
  const [index, setIndex] = useState(0);

  const instruments = state.song?.instruments ?? [];
  const selected = Math.min(index, Math.max(instruments.length - 1, 0));
  // Window the list so it never grows past the available height.
  const visible = Math.max(3, (height ?? 24) - 4);
  let start = 0;
  if (selected >= visible) start = selected - visible + 1;
  start = Math.min(start, Math.max(0, instruments.length - visible));
  const shown = instruments.slice(start, start + visible);

  const describe = (instrumentIndex: number): string => {
    const setting = state.settings[instrumentIndex];
    const source = setting?.sourceIndex ?? null;
    const sourceName =
      source !== null
        ? state.sampleNames[source] || `src ${source}`
        : "no source";
    if (setting?.spectral.percussion.enabled)
      return `percussion · ${sourceName}`;
    if (setting?.spectral.enabled) return `spectral · ${sourceName}`;
    return `sampler · ${sourceName}`;
  };

  useEffect(() => {
    if (!onExplain) return;
    const song = state.song;
    if (!song || instruments.length === 0) return;
    onExplain(instrumentExplain(song, selected));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, onExplain, instruments.length]);

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
          instruments.length === 0
            ? 0
            : Math.max(0, Math.min(instruments.length - 1, value + 1)),
        );
        return;
      }
      if (key.return) {
        onOpen(selected, "sampler");
        return;
      }
      if (char === "1") {
        onOpen(selected, "sampler");
        return;
      }
      if (char === "2") {
        onOpen(selected, "spectral");
        return;
      }
      if (char === "3") {
        onOpen(selected, "percussion");
        return;
      }
      if (char === "m") {
        const setting = state.settings[selected];
        if (setting)
          session.updateSamplerSetting(selected, { muted: !setting.muted });
        return;
      }
      if (char === "p") {
        session.backend?.preview(selected, state.reference);
      }
    },
    { isActive: active },
  );

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="yellow"
      paddingX={1}
    >
      <Text bold color="yellow">
        Instruments
      </Text>
      <Text dimColor wrap="truncate-end">
        ↑↓ select · 1/2/3 sampler/spectral/percussion · enter sampler · m mute ·
        p preview · esc close
        {instruments.length > visible
          ? ` · ${start + 1}-${Math.min(start + visible, instruments.length)}/${instruments.length}`
          : ""}
      </Text>
      <Box flexDirection="column">
        {instruments.length === 0 ? (
          <Text dimColor>(no instruments)</Text>
        ) : (
          shown.map((instrument, offset) => {
            const instrumentIndex = start + offset;
            const cursor = instrumentIndex === selected;
            const marked = instrumentIndex === highlightInstrument;
            const setting = state.settings[instrumentIndex];
            const muted = setting?.muted ? " (muted)" : "";
            return (
              <Box key={instrumentIndex}>
                <Text
                  color={marked && !cursor ? "yellow" : undefined}
                  bold={marked}
                >
                  {marked ? "◆" : " "}
                </Text>
                <Text
                  color={cursor ? "black" : marked ? "yellow" : undefined}
                  backgroundColor={cursor ? "white" : undefined}
                >
                  {String(instrumentIndex).padStart(2, "0")}
                </Text>
                <Text>
                  {" "}
                  {instrument.name.padEnd(18)} {describe(instrumentIndex)}
                  {muted}
                </Text>
              </Box>
            );
          })
        )}
      </Box>
    </Box>
  );
}
