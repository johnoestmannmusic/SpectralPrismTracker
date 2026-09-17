import { Box, Text, useApp, useInput, useWindowSize } from "ink";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { tokenize } from "./commands/registry";
import { createRegistry } from "./commands";
import type { CommandContext } from "./commands/types";
import { SongHeader } from "./components/SongHeader";
import { PatternView } from "./components/PatternView";
import { CommandBar, type Suggestion } from "./components/CommandBar";
import { StatusBar } from "./components/StatusBar";
import { HelpOverlay } from "./components/HelpOverlay";
import { MixerOverlay } from "./components/MixerOverlay";
import { SamplesOverlay } from "./components/SamplesOverlay";
import {
  InstrumentsOverlay,
  type InstrumentTab,
} from "./components/InstrumentsOverlay";
import { PatternsOverlay } from "./components/PatternsOverlay";
import { StepPanel } from "./components/StepPanel";
import { SongInfoPanel } from "./components/SongInfoPanel";
import { ExplainerPanel } from "./components/ExplainerPanel";
import {
  applyBuildStep,
  blankTargetFrom,
  buildSteps,
  cloneTarget,
  type BuildStep,
  type BuildTarget,
  type StepHighlight,
  type StepScreen,
} from "@/core/stepthrough";
import {
  DEFAULT_EXPLAINER,
  explainCursor,
  type ExplainerText,
} from "./explainer";
import {
  ParamEditorOverlay,
  type EditorGroup,
} from "./components/ParamEditorOverlay";
import {
  instrumentTabFor,
  masterFxGroups,
  percussionGroups,
  samplerGroups,
  spectralGroups,
} from "./editors";
import { useSession } from "./hooks";
import type { Session, SessionState } from "./session";

/**
 * Note entry keys. Uppercase letters enter the full chromatic scale; a few
 * non-conflicting lowercase keys also work. Lowercase letters that overlap the
 * original EDIT MODE functions (z/x/c/q/a/w/s) stay reserved for those.
 */
const NOTE_KEYS: Record<string, number> = {
  Z: 0,
  S: 1,
  X: 2,
  D: 3,
  C: 4,
  V: 5,
  G: 6,
  B: 7,
  H: 8,
  N: 9,
  J: 10,
  M: 11,
  d: 3,
  v: 5,
  g: 6,
  b: 7,
  h: 8,
  n: 9,
  j: 10,
  m: 11,
  l: 13,
  ",": 12,
  ".": 14,
};

/** "N rows × M cols" for the current block selection, or null when none. */
function selectionSummary(session: Session): string | null {
  const rect = session.selection();
  if (!rect) return null;
  return `${rect.rowHi - rect.rowLo + 1} rows × ${rect.colHi - rect.colLo + 1} cols`;
}

function stepChapterId(id: string): string {
  return id.split(".")[0] ?? "";
}

/** Moves to the previous/next chapter boundary in a step list. */
function jumpChapter(
  steps: BuildStep[],
  index: number,
  direction: -1 | 1,
): number {
  const current = stepChapterId(steps[index]?.id ?? "");
  let i = index;
  if (direction > 0) {
    i++;
    while (i < steps.length && stepChapterId(steps[i]!.id) === current) i++;
    return i >= steps.length ? steps.length - 1 : i;
  }
  i--;
  while (i >= 0 && stepChapterId(steps[i]!.id) === current) i--;
  return i < 0 ? 0 : i;
}

/** Maps a stepthrough screen to the overlay that renders it. */
function stepScreenToOverlay(screen: StepScreen): Overlay {
  switch (screen) {
    case "song":
      return "song";
    case "samples":
      return "samples";
    case "instruments":
      return "instruments";
    case "sampler":
      return "sampler";
    case "spectral":
      return "spectral";
    case "percussion":
      return "percussion";
    case "mixer":
      return "mixer";
    case "master-fx":
      return "fx";
    case "patterns":
      return "patterns";
    case "tracker":
      return "none";
  }
}

type Overlay =
  | "none"
  | "song"
  | "mixer"
  | "samples"
  | "instruments"
  | "patterns"
  | "sampler"
  | "spectral"
  | "percussion"
  | "fx";

interface Props {
  session: Session;
}

export function App({ session }: Props) {
  const liveState = useSession(session);
  const { exit } = useApp();
  const { rows, columns } = useWindowSize();
  const registry = useMemo(() => createRegistry(), []);

  const [paletteOpen, setPaletteOpen] = useState(false);
  const [input, setInput] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [selected, setSelected] = useState(0);
  const [helpOpen, setHelpOpen] = useState(false);
  const [overlay, setOverlay] = useState<Overlay>("none");
  const [editInstrument, setEditInstrument] = useState(0);
  /** When true, closing the editor returns to the instrument list. */
  const [returnToList, setReturnToList] = useState(false);
  /** Visual selection mode: plain arrows extend a block anchored at the cursor. */
  const [selectMode, setSelectMode] = useState(false);
  const [menuExplainer, setMenuExplainer] =
    useState<ExplainerText>(DEFAULT_EXPLAINER);
  /** Active STEPTHROUGH session: the recipe plus the model snapshot it grows. */
  const [stepMode, setStepMode] = useState<{
    steps: BuildStep[];
    base: BuildTarget;
    index: number;
  } | null>(null);
  const inputRef = useRef(input);
  inputRef.current = input;
  const suggestionsRef = useRef(suggestions);
  suggestionsRef.current = suggestions;

  const startStepthrough = useCallback(() => {
    const final = session.snapshotTarget();
    if (!final) return;
    const steps = buildSteps(final);
    setHelpOpen(false);
    if (steps.length === 0) {
      session.setStatus("Nothing to rebuild — project is already empty");
      return;
    }
    // Start from a blank project and build it up step by step.
    setStepMode({ steps, base: blankTargetFrom(final), index: 0 });
    session.setStatus(`Stepthrough: ${steps.length} steps`);
  }, [session]);

  const stopStepthrough = useCallback(() => {
    setStepMode(null);
    session.restoreStepAudio();
    session.setStatus("Stepthrough off");
  }, [session]);

  const currentStep = stepMode ? stepMode.steps[stepMode.index] : null;
  const stepTarget = useMemo(() => {
    if (!stepMode) return null;
    const target = cloneTarget(stepMode.base);
    for (let i = 0; i <= stepMode.index; i++)
      applyBuildStep(target, stepMode.steps[i]!);
    return target;
  }, [stepMode]);

  /** In stepthrough the whole UI renders from the grown snapshot, not the live session. */
  const state: SessionState = useMemo(() => {
    if (!stepTarget || !currentStep) return liveState;
    const cell = currentStep.highlights.find((h) => h.kind === "cell");
    return {
      ...liveState,
      song: stepTarget.song,
      settings: stepTarget.settings,
      project: stepTarget.project,
      channelVolume: stepTarget.channelVolume,
      channelMuted: stepTarget.channelMuted,
      masterVolume: stepTarget.masterVolume,
      masterFx: stepTarget.masterFx,
      sampleNames: stepTarget.project.sourceSamples.map(
        (sample) => sample?.name ?? "",
      ),
      follow: false,
      viewOrder: currentStep.order ?? liveState.viewOrder,
      viewRow: null,
      cursor: {
        ...liveState.cursor,
        order: currentStep.order ?? liveState.cursor.order,
        row: cell?.row ?? liveState.cursor.row,
        channel: cell?.channel ?? liveState.cursor.channel,
      },
    };
  }, [liveState, stepTarget, currentStep]);

  const ctx = useMemo<CommandContext>(
    () => ({
      session,
      exit,
      listCommands: () => registry.all(),
      print: (text: string) => session.setStatus(text),
      openOverlay: (name, arg) => {
        if (name === "stepthrough") {
          if (arg === -1) stopStepthrough();
          else startStepthrough();
          return;
        }
        if (arg !== undefined && Number.isFinite(arg)) {
          const count = session.getState().song?.instruments.length ?? 1;
          setEditInstrument(
            Math.min(Math.max(Math.round(arg), 0), Math.max(count - 1, 0)),
          );
        }
        setReturnToList(false);
        setOverlay(name);
      },
    }),
    [session, exit, registry, startStepthrough, stopStepthrough],
  );

  const runCommand = useCallback(
    async (raw: string) => {
      const result = await registry.execute(raw, ctx);
      session.recordCommand(raw);
      setPaletteOpen(false);
      setInput("");
      if (result.ok) {
        const data = result.data as { commands?: unknown } | undefined;
        if (data?.commands) {
          setHelpOpen(true);
          session.setStatus("");
        } else {
          session.setError(null);
          session.setStatus(result.message ?? "OK");
        }
      } else {
        session.setError(result.error ?? "Command failed");
      }
    },
    [registry, ctx, session],
  );

  // Cheap poll for the transport position/playhead.
  useEffect(() => {
    const timer = setInterval(() => session.refreshPlayhead(), 100);
    return () => clearInterval(timer);
  }, [session]);

  // Refresh live waveform previews while a parameter editor is open.
  const [, setEditorTick] = useState(0);
  useEffect(() => {
    if (overlay === "none" || overlay === "mixer" || overlay === "samples")
      return;
    const timer = setInterval(() => setEditorTick((value) => value + 1), 300);
    return () => clearInterval(timer);
  }, [overlay]);

  // Command/arg suggestions (async because path completion hits the fs).
  useEffect(() => {
    if (!paletteOpen) {
      setSuggestions([]);
      return;
    }
    // Leave room for the popup: cap suggestions so they never push the layout
    // past the terminal height (which clipped a row).
    const cap = Math.max(0, Math.min(8, rows - 11));
    let cancelled = false;
    void (async () => {
      const raw = input.startsWith("/") ? input.slice(1) : input;
      const tokens = tokenize(raw);
      const trailing = /\s$/.test(raw);
      if (!trailing && tokens.length <= 1) {
        const query = tokens[0] ?? "";
        const items = registry.suggest(query, 8).map<Suggestion>((command) => ({
          label: `/${command.name}`,
          description: command.description,
          insert: `/${command.name} `,
          replaceFrom: 0,
        }));
        if (!cancelled) {
          setSuggestions(items.slice(0, cap));
          setSelected(0);
        }
        return;
      }
      const def = registry.get(tokens[0] ?? "");
      if (!def) {
        if (!cancelled) {
          setSuggestions([]);
          setSelected(0);
        }
        return;
      }
      const argIndex = (trailing ? tokens.length : tokens.length - 1) - 1;
      const arg = def.args?.[argIndex];
      if (!arg) {
        if (!cancelled) {
          setSuggestions([]);
          setSelected(0);
        }
        return;
      }
      const prefix = trailing ? "" : (tokens[tokens.length - 1] ?? "");
      let candidates: string[] = [];
      try {
        candidates = await registry.completeArg(def, argIndex, prefix, ctx);
      } catch {
        candidates = [];
      }
      if (!cancelled) {
        setSuggestions(
          candidates.slice(0, cap).map((candidate) => ({
            label: candidate,
            description: arg.description,
            insert: candidate,
            replaceFrom: input.length - prefix.length,
          })),
        );
        setSelected(0);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [input, paletteOpen, registry, ctx, rows]);

  const applySuggestion = useCallback(() => {
    const suggestion = suggestionsRef.current[selected];
    if (!suggestion) return;
    setInput(
      (current) => current.slice(0, suggestion.replaceFrom) + suggestion.insert,
    );
  }, [selected]);

  const recall = useCallback(
    (direction: -1 | 1) => {
      const command = session.recallCommand(direction);
      if (command === null) return;
      setPaletteOpen(true);
      setInput(command);
    },
    [session],
  );

  useInput(
    (char, key) => {
      if (paletteOpen) {
        if (key.escape) {
          setPaletteOpen(false);
          setInput("");
          return;
        }
        if (key.return) {
          // Enter autocompletes an unfinished command exactly like Tab; once
          // the command name is complete it executes.
          if (
            registry.enterAction(
              inputRef.current,
              suggestionsRef.current.length > 0,
            ) === "complete"
          ) {
            applySuggestion();
            return;
          }
          void runCommand(inputRef.current);
          return;
        }
        if (key.tab) {
          applySuggestion();
          return;
        }
        if (key.ctrl && char === "p") {
          recall(-1);
          return;
        }
        if (key.ctrl && char === "n") {
          recall(1);
          return;
        }
        if (key.upArrow) {
          setSelected((index) => Math.max(0, index - 1));
          return;
        }
        if (key.downArrow) {
          setSelected((index) =>
            suggestionsRef.current.length === 0
              ? 0
              : Math.max(
                  0,
                  Math.min(suggestionsRef.current.length - 1, index + 1),
                ),
          );
          return;
        }
        if (key.backspace || key.delete) {
          setInput((current) => current.slice(0, -1));
          return;
        }
        if (key.ctrl) return;
        if (char) setInput((current) => current + char);
        return;
      }

      // ---- tracker mode ----
      if (key.ctrl && char === "p") {
        recall(-1);
        return;
      }
      if (key.ctrl && char === "n") {
        recall(1);
        return;
      }
      if (char === "/") {
        setPaletteOpen(true);
        setInput("/");
        return;
      }
      if (char === "?") {
        setHelpOpen(true);
        return;
      }
      // Visual selection mode (`e`): a terminal-safe alternative to
      // Shift+arrows, which many terminals capture for scrollback. Pressing `e`
      // starts the selection; arrows extend it; pressing `e` again copies the
      // block and ends the selection. `t` cuts it, `r` pastes the clipboard.
      if (char === "e" || char === "E") {
        if (selectMode) {
          const summary = selectionSummary(session);
          if (session.copySelection()) {
            session.clearSelection();
            setSelectMode(false);
            session.setStatus(summary ? `Copied ${summary}` : "Copied");
          } else {
            setSelectMode(false);
            session.setStatus("Nothing highlighted to copy");
          }
        } else {
          session.startSelection();
          setSelectMode(true);
          session.setStatus(
            "Selection mode: arrows extend · e copy · t cut · esc clear",
          );
        }
        return;
      }
      if (char === "r" || char === "R") {
        const flood = char === "R";
        session.clearSelection();
        setSelectMode(false);
        session.setStatus(
          session.pasteSelection(flood)
            ? flood
              ? "Flood-pasted to end of pattern"
              : "Pasted from clipboard"
            : "Clipboard is empty",
        );
        return;
      }
      if (char === "t" || char === "T") {
        const summary = selectionSummary(session);
        if (summary && session.cutSelection()) {
          session.clearSelection();
          setSelectMode(false);
          session.setStatus(`Cut ${summary} to clipboard`);
        } else {
          session.setStatus("Nothing highlighted to cut");
        }
        return;
      }
      // v: jump straight to the cursor row's instrument settings, on the tab
      // matching its active mode (percussion > spectral > sampler).
      if (char === "v") {
        const count = state.song?.instruments.length ?? 0;
        if (count === 0) return;
        const found = session.instrumentAtCursor();
        const index = Math.min(Math.max(found ?? 0, 0), count - 1);
        setEditInstrument(index);
        setReturnToList(false);
        setOverlay(instrumentTabFor(state.settings[index]));
        return;
      }
      if (key.escape) {
        session.clearSelection();
        setSelectMode(false);
        return;
      }

      // Undo/redo.
      if (key.ctrl && char === "z") {
        session.undo();
        return;
      }
      if (key.ctrl && char === "y") {
        session.redo();
        return;
      }
      // Ctrl+S: save to the current project path, or prompt for a path (a new
      // unsaved project has none).
      if (key.ctrl && char === "s") {
        const target = state.projectPath;
        if (target) {
          void runCommand(`/save "${target}"`);
        } else {
          setPaletteOpen(true);
          setInput("/save ");
        }
        return;
      }
      // Clipboard. Ctrl+Shift+C/X/V (undefined Ctrl+Shift+F for flood) so that
      // plain Ctrl+C stays available to quit the app, and the uppercase note
      // keys (X/C/V) keep working.
      const ctrlShift = (letter: string) =>
        key.ctrl && key.shift && char?.toLowerCase() === letter;
      if (ctrlShift("c")) {
        const summary = selectionSummary(session);
        session.setStatus(
          session.copySelection()
            ? summary
              ? `Copied ${summary}`
              : "Copied"
            : "Nothing highlighted to copy",
        );
        return;
      }
      if (ctrlShift("x") || (key.ctrl && char === "x")) {
        const summary = selectionSummary(session);
        session.setStatus(
          session.cutSelection()
            ? `Cut ${summary ?? "selection"} to clipboard`
            : "Nothing highlighted to cut",
        );
        if (summary) session.clearSelection();
        return;
      }
      if (ctrlShift("v") || (key.ctrl && char === "v")) {
        session.setStatus(
          session.pasteSelection(false)
            ? "Pasted from clipboard"
            : "Clipboard is empty",
        );
        return;
      }
      if (ctrlShift("f")) {
        session.setStatus(
          session.pasteSelection(true)
            ? "Flood-pasted to end of pattern"
            : "Clipboard is empty",
        );
        return;
      }
      if (key.ctrl && char === "a") {
        session.selectAll();
        return;
      }
      // Ctrl+arrows: jump 16 rows (wrapping orders) / jump channel (NOTE).
      if (key.ctrl && key.upArrow) {
        if (key.shift || selectMode) session.extendSelection({ row: -16 });
        else session.moveCursor({ row: -16 });
        return;
      }
      if (key.ctrl && key.downArrow) {
        if (key.shift || selectMode) session.extendSelection({ row: 16 });
        else session.moveCursor({ row: 16 });
        return;
      }
      if (key.ctrl && key.leftArrow) {
        if (key.shift || selectMode) session.extendSelection({ channel: -1 });
        else session.moveCursor({ channel: -1 });
        return;
      }
      if (key.ctrl && key.rightArrow) {
        if (key.shift || selectMode) session.extendSelection({ channel: 1 });
        else session.moveCursor({ channel: 1 });
        return;
      }
      // Ctrl+Space: terminals send NUL, which Ink reports as ctrl+`.
      if (key.ctrl && (char === " " || char === "`")) {
        session.playFromCursor();
        return;
      }

      if (key.tab) {
        session.moveCursor({ channel: 1 });
        return;
      }
      if (key.upArrow) {
        if (key.shift || selectMode) session.extendSelection({ row: -1 });
        else session.moveCursor({ row: -1 });
        return;
      }
      if (key.downArrow) {
        if (key.shift || selectMode) session.extendSelection({ row: 1 });
        else session.moveCursor({ row: 1 });
        return;
      }
      if (key.leftArrow) {
        if (key.shift || selectMode) session.extendSelection({ column: -1 });
        else session.moveCursor({ column: -1 });
        return;
      }
      if (key.rightArrow) {
        if (key.shift || selectMode) session.extendSelection({ column: 1 });
        else session.moveCursor({ column: 1 });
        return;
      }
      if (key.pageUp) {
        if (key.shift || selectMode) session.extendSelection({ order: -1 });
        else session.moveCursor({ order: -1 });
        return;
      }
      if (key.pageDown) {
        if (key.shift || selectMode) session.extendSelection({ order: 1 });
        else session.moveCursor({ order: 1 });
        return;
      }
      // [ / ] cycle through the orders from the main edit screen.
      if (char === "[") {
        session.moveCursor({ order: -1 });
        return;
      }
      if (char === "]") {
        session.moveCursor({ order: 1 });
        return;
      }
      if (key.delete || key.backspace) {
        session.clearCell();
        return;
      }
      if (char === " ") {
        session.togglePlay();
        return;
      }

      // Single-key edit functions (match the original EDIT MODE shortcuts).
      if (char === "z") {
        session.applyLastValue();
        return;
      }
      if (char === "x") {
        session.clearCell();
        return;
      }
      if (char === "c") {
        session.noteOff();
        return;
      }
      if (char === "q") {
        session.adjustValue(1);
        return;
      }
      if (char === "a") {
        session.adjustValue(-1);
        return;
      }
      if (char === "w") {
        session.adjustValue(12);
        return;
      }
      if (char === "s") {
        session.adjustValue(-12);
        return;
      }
      if (char === "+" || char === "=") {
        session.setLastOctave(session.lastOctaveValue + 1);
        return;
      }
      if (char === "-" || char === "_") {
        session.setLastOctave(session.lastOctaveValue - 1);
        return;
      }
      const semitone = NOTE_KEYS[char];
      if (semitone !== undefined) {
        const note = 60 + session.lastOctaveValue * 12 + semitone;
        session.editCell({ note: { kind: "note", note } });
      }
    },
    { isActive: overlay === "none" && !helpOpen && !stepMode },
  );

  // Visual selection only applies to the tracker; leaving it (or opening any
  // overlay/help/palette) drops the mode so arrows behave normally on return.
  useEffect(() => {
    if (overlay !== "none" || helpOpen || paletteOpen || stepMode) {
      setSelectMode(false);
    }
  }, [overlay, helpOpen, paletteOpen, stepMode]);

  // Audition each step against the growing project (debounced). A tick after
  // the engine re-sync forces the editor waveforms to redraw from the new
  // (partial) settings, so stepping backwards un-renders Spectral too.
  const [, setStepAudioTick] = useState(0);
  useEffect(() => {
    if (!stepMode || !stepTarget || !currentStep) return;
    const timer = setTimeout(() => {
      void session
        .previewBuildStep(stepTarget, currentStep)
        .then(() => setStepAudioTick((tick) => tick + 1));
    }, 220);
    return () => clearTimeout(timer);
  }, [session, stepMode, stepTarget, currentStep]);

  // STEPTHROUGH navigation takes over all input while the mode is active.
  useInput(
    (char, key) => {
      if (!stepMode) return;
      if (key.escape) {
        stopStepthrough();
        return;
      }
      if (key.upArrow) {
        setStepMode((mode) =>
          mode ? { ...mode, index: Math.max(0, mode.index - 1) } : mode,
        );
        return;
      }
      if (key.downArrow) {
        setStepMode((mode) =>
          mode
            ? {
                ...mode,
                index: Math.min(mode.steps.length - 1, mode.index + 1),
              }
            : mode,
        );
        return;
      }
      if (key.pageUp || key.pageDown) {
        const direction = key.pageUp ? -1 : 1;
        setStepMode((mode) =>
          mode
            ? {
                ...mode,
                index: jumpChapter(mode.steps, mode.index, direction),
              }
            : mode,
        );
        return;
      }
      if (char === "[" || char === "]") {
        const direction = char === "[" ? -1 : 1;
        setStepMode((mode) =>
          mode
            ? {
                ...mode,
                index: jumpChapter(mode.steps, mode.index, direction),
              }
            : mode,
        );
        return;
      }
      if (key.home) {
        setStepMode((mode) => (mode ? { ...mode, index: 0 } : mode));
        return;
      }
      if (key.end) {
        setStepMode((mode) =>
          mode ? { ...mode, index: mode.steps.length - 1 } : mode,
        );
      }
    },
    { isActive: stepMode !== null },
  );

  const viewportRows = Math.max(
    3,
    rows - 8 - (paletteOpen ? suggestions.length : 0),
  );
  const playhead = state.playing ? session.playheadPosition() : null;

  const trackerExplainer = useMemo(() => explainCursor(state), [state]);
  const editorHint =
    overlay === "fx"
      ? "↑↓ select · ctrl+↑↓ cat · ←→ adj · ctrl+←→ big · enter type · p preview · esc"
      : "↑↓ select · ctrl+↑↓ cat · ←→ adj · ctrl+←→ big · enter type · p preview · [ ] mode · , . ins · esc";
  const explainer: ExplainerText = helpOpen
    ? {
        title: "Help — commands & keys",
        body: "Browse every slash command and EDIT MODE shortcut. Ctrl+↑/↓ jumps between command categories.",
      }
    : overlay === "none"
      ? trackerExplainer
      : menuExplainer;
  const showExplainer = columns >= 84;
  const showPanel = stepMode !== null || showExplainer;
  const panelWidth = columns >= 140 ? 48 : columns >= 110 ? 40 : 30;
  const contentHeight = viewportRows + 2;
  // The explainer reserves the bottom ~6 rows for the channel/master meters.
  const explainerHeight = Math.max(6, contentHeight - 6);
  const contentWidth = columns - (showPanel ? panelWidth : 0);

  const activeOverlay: Overlay = currentStep
    ? stepScreenToOverlay(currentStep.screen)
    : overlay;
  const activeInstrument = currentStep?.instrument ?? editInstrument;
  const stepHighlights: StepHighlight[] = currentStep?.highlights ?? [];
  const paramHighlights = stepHighlights
    .filter((h) => h.kind === "param")
    .map((h) => ({ group: h.group, label: h.label }));
  const cellHighlights = stepHighlights
    .filter((h) => h.kind === "cell")
    .map((h) => ({
      channel: h.channel ?? 0,
      order: h.order ?? 0,
      row: h.row ?? 0,
    }));
  const highlightedInstrument = stepHighlights.find(
    (h) => h.kind === "instrument",
  )?.instrument;
  const highlightedSlot = stepHighlights.find((h) => h.kind === "sample")?.slot;
  const highlightedOrder = stepHighlights.find(
    (h) => h.kind === "order",
  )?.order;
  const highlightedChannel = stepHighlights.find(
    (h) => h.kind === "channel",
  )?.channel;
  const highlightMixerRow =
    highlightedChannel !== undefined
      ? highlightedChannel
      : stepHighlights.some((h) => h.kind === "row")
        ? 4
        : undefined;

  const instrumentCount = state.song?.instruments.length ?? 0;
  const instrumentLabel =
    state.song?.instruments[activeInstrument]?.name ??
    `Instrument ${activeInstrument}`;
  const settingsOverride = stepTarget?.settings[activeInstrument];
  const editorGroups: EditorGroup[] | null =
    activeOverlay === "sampler"
      ? samplerGroups(session, activeInstrument, settingsOverride)
      : activeOverlay === "spectral"
        ? spectralGroups(session, activeInstrument, settingsOverride)
        : activeOverlay === "percussion"
          ? percussionGroups(session, activeInstrument, settingsOverride)
          : activeOverlay === "fx"
            ? masterFxGroups(session, stepTarget?.masterFx)
            : null;
  const editorTitle =
    activeOverlay === "sampler"
      ? `Sampler — ${instrumentLabel}`
      : activeOverlay === "spectral"
        ? `Spectral — ${instrumentLabel}`
        : activeOverlay === "percussion"
          ? `Percussion — ${instrumentLabel}`
          : "Master FX";
  const instrumentTabs: InstrumentTab[] = ["sampler", "spectral", "percussion"];
  const editorTabs =
    editorGroups && activeOverlay !== "fx"
      ? {
          labels: ["Sampler", "Spectral", "Percussion"],
          active: Math.max(
            instrumentTabs.indexOf(activeOverlay as InstrumentTab),
            0,
          ),
          onSelect: (index: number) =>
            setOverlay(instrumentTabs[index] ?? "sampler"),
          highlight: [
            false,
            !!state.settings[activeInstrument]?.spectral.enabled,
            !!state.settings[activeInstrument]?.spectral.percussion.enabled,
          ],
        }
      : undefined;
  const stepInstrument = (direction: 1 | -1) => {
    if (instrumentCount === 0) return;
    setEditInstrument((index) =>
      Math.min(Math.max(index + direction, 0), instrumentCount - 1),
    );
  };

  const menuContext =
    stepMode && currentStep
      ? {
          title: `Step ${stepMode.index + 1}/${stepMode.steps.length} — ${currentStep.title}`,
          hint: "↑↓ step · pgup/pgdn chapter · home/end · esc exit",
        }
      : helpOpen
        ? {
            title: "Help — commands & keys",
            hint: "↑↓/jk scroll · ctrl+↑↓ category · space/PgDn page · esc close",
          }
        : editorGroups
          ? { title: editorTitle, hint: editorHint }
          : activeOverlay === "mixer"
            ? {
                title: "Mixer / Master FX",
                hint: "↑↓ select · ctrl+↑↓ category · ←→ adjust · m mute/toggle · esc close",
              }
            : activeOverlay === "samples"
              ? {
                  title: "Source Samples",
                  hint: "↑↓ select · p preview · enter edit info · esc close",
                }
              : activeOverlay === "instruments"
                ? {
                    title: "Instruments",
                    hint: "↑↓ select · 1/2/3 sampler/spectral/percussion · enter sampler · m mute · p preview · esc close",
                  }
                : activeOverlay === "patterns"
                  ? {
                      title: "Pattern Manager",
                      hint: "↑↓ select · shift+↑↓/J/K move · a add · d duplicate · x remove · e number · enter jump · esc close",
                    }
                  : null;

  return (
    <Box flexDirection="column" width={columns} height={rows}>
      <SongHeader state={state} playhead={playhead} context={menuContext} />
      <Box flexDirection="row" flexGrow={1}>
        <Box flexDirection="column" flexGrow={1}>
          {helpOpen ? (
            <HelpOverlay
              commands={registry.all()}
              active={helpOpen}
              height={viewportRows}
              onClose={() => setHelpOpen(false)}
            />
          ) : activeOverlay === "song" ? (
            <SongInfoPanel state={state} highlight={paramHighlights} />
          ) : editorGroups ? (
            <ParamEditorOverlay
              title={editorTitle}
              groups={editorGroups}
              active={!stepMode && activeOverlay !== "none"}
              height={viewportRows}
              onClose={() => setOverlay(returnToList ? "instruments" : "none")}
              onExplain={setMenuExplainer}
              onPreview={
                activeOverlay === "fx"
                  ? undefined
                  : () => void session.previewAfterRender(activeInstrument)
              }
              onPrev={
                activeOverlay === "fx" ? undefined : () => stepInstrument(-1)
              }
              onNext={
                activeOverlay === "fx" ? undefined : () => stepInstrument(1)
              }
              tabs={editorTabs}
              hint={editorHint}
              highlight={paramHighlights}
            />
          ) : activeOverlay === "instruments" ? (
            <InstrumentsOverlay
              session={session}
              active={!stepMode && activeOverlay === "instruments"}
              onClose={() => setOverlay("none")}
              onOpen={(index, tab) => {
                setEditInstrument(index);
                setReturnToList(true);
                setOverlay(tab);
              }}
              onExplain={setMenuExplainer}
              height={contentHeight}
              state={stepMode ? state : undefined}
              highlightInstrument={highlightedInstrument}
            />
          ) : activeOverlay === "patterns" ? (
            <PatternsOverlay
              session={session}
              active={!stepMode && activeOverlay === "patterns"}
              onClose={() => setOverlay("none")}
              onExplain={setMenuExplainer}
              height={contentHeight}
              state={stepMode ? state : undefined}
              highlightOrder={highlightedOrder}
            />
          ) : activeOverlay === "mixer" ? (
            <MixerOverlay
              session={session}
              active={!stepMode && activeOverlay === "mixer"}
              onClose={() => setOverlay("none")}
              onExplain={setMenuExplainer}
              state={stepMode ? state : undefined}
              highlightRow={highlightMixerRow}
            />
          ) : activeOverlay === "samples" ? (
            <SamplesOverlay
              session={session}
              active={!stepMode && activeOverlay === "samples"}
              onClose={() => setOverlay("none")}
              onExplain={setMenuExplainer}
              width={contentWidth}
              height={contentHeight}
              state={stepMode ? state : undefined}
              highlightSlot={highlightedSlot}
            />
          ) : (
            <PatternView
              state={state}
              viewportRows={viewportRows}
              playhead={stepMode ? null : playhead}
              selection={stepMode ? null : session.selection()}
              highlight={cellHighlights}
            />
          )}
        </Box>
        {stepMode ? (
          <StepPanel
            steps={stepMode.steps}
            index={stepMode.index}
            width={panelWidth}
            height={contentHeight}
          />
        ) : showExplainer ? (
          <ExplainerPanel
            content={explainer}
            width={panelWidth}
            height={explainerHeight}
            session={session}
          />
        ) : null}
      </Box>
      <StatusBar
        status={state.status}
        error={state.error}
        hint={
          menuContext?.hint ??
          "space play · q/a ±value · / commands · ctrl+p recall · ? help"
        }
      />
      <CommandBar
        input={input}
        active={paletteOpen}
        placeholder="type / for commands…"
        suggestions={suggestions}
        selected={selected}
      />
    </Box>
  );
}
