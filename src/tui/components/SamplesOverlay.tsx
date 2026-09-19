import { Box, Text, useInput, useWindowSize } from "ink";
import { useEffect, useState } from "react";
import { renderWaveform } from "../format";
import type { Session } from "../session";
import { useSession } from "../hooks";
import type { ExplainerText } from "../explainer";
import type { SessionState } from "../session";
import { ActionMenu } from "./ActionMenu";
import { contextActions, type ContextAction } from "../contextActions";
import { isCancel, isConfirm } from "../keys";

interface Props {
  session: Session;
  active: boolean;
  onClose: () => void;
  onExplain?: (content: ExplainerText) => void;
  /** Width available to the overlay (excludes the explainer panel). */
  width?: number;
  /** Height available to the overlay. */
  height?: number;
  /** Preview state supplied by stepthrough (defaults to the live session). */
  state?: SessionState;
  /** Stepthrough sample slot to mark. */
  highlightSlot?: number;
  /** Slot to focus when the overlay opens (e.g. from an instrument menu). */
  initialSlot?: number;
  /** Executes a slash command chosen from the action menu. */
  onCommand?: (line: string) => void;
  /** Opens the command bar prefilled to import into this slot. */
  onImportSample?: (slot: number) => void;
}

type InfoField = "name" | "comments";

interface EditState {
  slot: number;
  field: InfoField;
  name: string;
  comments: string;
}

/** Source-sample browser with an ASCII waveform, info editing and assignments. */
export function SamplesOverlay({
  session,
  active,
  onClose,
  onExplain,
  width: availableWidth,
  height: availableHeight,
  state: stateOverride,
  highlightSlot,
  initialSlot,
  onCommand,
  onImportSample,
}: Props) {
  const live = useSession(session);
  const state = stateOverride ?? live;
  const { columns } = useWindowSize();
  const [index, setIndex] = useState(initialSlot ?? 0);
  const [edit, setEdit] = useState<EditState | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (initialSlot !== undefined) setIndex(initialSlot);
  }, [initialSlot]);

  const names = state.sampleNames;
  const durations = session.sampleDurations();
  const selected = Math.min(index, Math.max(names.length - 1, 0));
  const waveform = session.sampleWaveform(selected);
  const width = Math.max(20, Math.min((availableWidth ?? columns) - 6, 100));
  // Keep the overlay within the available height: 15 chrome rows + the
  // (non-interactive) instrument list, which is capped to whatever fits.
  const instrumentCap = Math.max(1, (availableHeight ?? 40) - 15);

  const openEdit = (slot: number) => {
    setEdit({
      slot,
      field: "name",
      name: session.sampleName(slot),
      comments: session.sampleComments(slot),
    });
  };

  const saveEdit = () => {
    if (!edit) return;
    session.updateSampleInfo(edit.slot, {
      name: edit.name,
      comments: edit.comments,
    });
    setEdit(null);
  };

  const runAction = (action: ContextAction) => {
    setMenuOpen(false);
    if (action.special === "edit-sample") {
      openEdit(selected);
      return;
    }
    if (action.special === "import-sample") {
      onImportSample?.(selected);
      return;
    }
    if (action.command) onCommand?.(action.command);
  };

  useEffect(() => {
    if (!onExplain) return;
    if (edit) {
      onExplain({
        title: `Source sample ${edit.slot} · info`,
        body: "Name is shown in the slot list, the sampler's Source list and saved with the project. Comments are free-text notes (origin, licensing, usage). Tab/↑↓ switches fields; Enter saves from the Comments field; Esc cancels.",
      });
      return;
    }
    const name = names[selected] || `sample ${selected}`;
    const duration = durations[selected] ?? 0;
    onExplain({
      title: `Source sample ${selected} · ${name}`,
      body: `Slot ${selected} of the six bundled clips (${duration.toFixed(
        2,
      )}s). Enter edits the name/comments, p previews. An instrument points at this slot to play it, pitched to the note.`,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, edit, onExplain, names.length]);

  useInput(
    (char, key) => {
      if (edit) {
        if (key.escape) {
          setEdit(null);
          return;
        }
        if (key.return) {
          if (edit.field === "name") setEdit({ ...edit, field: "comments" });
          else saveEdit();
          return;
        }
        if (key.tab || key.upArrow || key.downArrow) {
          setEdit({
            ...edit,
            field: edit.field === "name" ? "comments" : "name",
          });
          return;
        }
        if (key.backspace || key.delete) {
          setEdit((current) =>
            current
              ? {
                  ...current,
                  [current.field]: current[current.field].slice(0, -1),
                }
              : current,
          );
          return;
        }
        if (key.ctrl || key.meta || key.leftArrow || key.rightArrow) return;
        if (char) {
          setEdit((current) =>
            current
              ? { ...current, [current.field]: current[current.field] + char }
              : current,
          );
        }
        return;
      }

      if (menuOpen) return; // ActionMenu owns the keyboard while open.

      if (isCancel(char, key) || char === "q") {
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
      if (isConfirm(char, key)) {
        setMenuOpen(true);
        return;
      }
      if (char === "p") {
        session.backend?.previewSample(selected);
        return;
      }
      // A adds: import an audio file into the selected slot (FEAT-146).
      if (char === "a") {
        onImportSample?.(selected);
      }
    },
    { isActive: active },
  );

  if (menuOpen) {
    return (
      <ActionMenu
        title={`Source sample ${String(selected).padStart(2, "0")} · ${
          names[selected] || `sample ${selected}`
        }`}
        actions={contextActions(state, { kind: "sample", slot: selected })}
        active={active}
        onExplain={onExplain}
        onClose={() => setMenuOpen(false)}
        onRun={runAction}
      />
    );
  }

  if (edit) {
    const field = (name: InfoField, label: string) => (
      <Box>
        <Text
          color={edit.field === name ? "black" : undefined}
          backgroundColor={edit.field === name ? "white" : undefined}
        >
          {label.padEnd(10)}
        </Text>
        <Text>
          {" "}
          {edit[name]}
          {edit.field === name ? "▏" : ""}
        </Text>
      </Box>
    );
    return (
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor="magenta"
        paddingX={1}
      >
        <Text bold color="magenta">
          Source Sample {String(edit.slot).padStart(2, "0")} — info
        </Text>
        <Text dimColor>↑↓/tab switch field · enter next/save · esc cancel</Text>
        <Box flexDirection="column" marginTop={1}>
          {field("name", "Name")}
          {field("comments", "Comments")}
        </Box>
      </Box>
    );
  }

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
      <Text dimColor>
        ↑↓ select · p preview · a import · enter menu · esc close
      </Text>
      <Box flexDirection="column">
        {names.map((name, sampleIndex) => {
          const cursor = sampleIndex === selected;
          const marked = sampleIndex === highlightSlot;
          return (
            <Box key={sampleIndex}>
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
        {instruments
          .slice(0, instrumentCap)
          .map((instrument, instrumentIndex) => {
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
