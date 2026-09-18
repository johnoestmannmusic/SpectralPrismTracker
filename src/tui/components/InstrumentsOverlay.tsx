import { Box, Text, useInput } from "ink";
import { useEffect, useState } from "react";
import { useSession } from "../hooks";
import { instrumentExplain, type ExplainerText } from "../explainer";
import type { Session, SessionState } from "../session";
import { ActionMenu } from "./ActionMenu";
import { contextActions, type ContextAction } from "../contextActions";

export type InstrumentTab = "sampler" | "spectral" | "percussion" | "chord";

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
  /** Executes a slash command chosen from the action menu. */
  onCommand?: (line: string) => void;
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
  onCommand,
}: Props) {
  const live = useSession(session);
  const state = stateOverride ?? live;
  const [index, setIndex] = useState(0);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);

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

  const runAction = (action: ContextAction) => {
    setMenuOpen(false);
    if (action.special === "rename-instrument") {
      setRenaming(instruments[selected]?.name ?? "");
      return;
    }
    if (action.special === "delete-instrument") {
      setConfirmDelete(true);
      return;
    }
    if (action.command) onCommand?.(action.command);
  };

  useInput(
    (char, key) => {
      if (renaming !== null) {
        if (key.escape) {
          setRenaming(null);
          return;
        }
        if (key.return) {
          const next = renaming.trim();
          if (next) session.setInstrumentName(selected, next);
          setRenaming(null);
          return;
        }
        if (key.backspace || key.delete) {
          setRenaming((text) => (text ?? "").slice(0, -1));
          return;
        }
        if (key.ctrl || key.meta || key.tab) return;
        if (char) setRenaming((text) => (text ?? "") + char);
        return;
      }
      if (menuOpen) return; // ActionMenu owns the keyboard while open.
      if (confirmDelete) {
        if (char === "y" || key.return) {
          const deleting = selected;
          if (session.deleteInstrument(deleting)) {
            setIndex((value) =>
              Math.max(0, Math.min(value, instruments.length - 2)),
            );
          } else {
            session.setStatus("Cannot delete the only instrument");
          }
          setConfirmDelete(false);
          return;
        }
        if (char === "n" || key.escape || char === "x" || char === "q") {
          setConfirmDelete(false);
        }
        return;
      }
      if (key.escape || char === "q" || char === "x") {
        onClose();
        return;
      }
      if (char === "a") {
        const added = session.addInstrument();
        if (added >= 0) setIndex(added);
        return;
      }
      if (char === "d" || key.delete) {
        if (instruments.length <= 1) {
          session.setStatus("Cannot delete the only instrument");
        } else {
          setConfirmDelete(true);
        }
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
      if (key.return || char === "z") {
        setMenuOpen(true);
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

  if (menuOpen) {
    return (
      <ActionMenu
        title={`Instrument ${String(selected).padStart(2, "0")} · ${
          instruments[selected]?.name ?? ""
        }`}
        actions={contextActions(state, { kind: "instrument", index: selected })}
        active={active}
        height={height}
        onClose={() => setMenuOpen(false)}
        onRun={runAction}
      />
    );
  }

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
        ↑↓ select · 1/2/3 sampler/spectral/percussion · enter menu · a add · d
        delete · m mute · p preview · esc close
        {instruments.length > visible
          ? ` · ${start + 1}-${Math.min(start + visible, instruments.length)}/${instruments.length}`
          : ""}
      </Text>
      {confirmDelete && instruments[selected] ? (
        <Text color="red" bold>
          Delete instrument {String(selected).padStart(2, "0")} “
          {instruments[selected]!.name}”? Are you sure? (y/n)
        </Text>
      ) : null}
      {renaming !== null ? (
        <Text color="cyan">
          Rename “{instruments[selected]?.name}” → {renaming}▏ · enter apply ·
          esc cancel
        </Text>
      ) : null}
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
