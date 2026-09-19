import { Box, Text, useApp, useInput, useWindowSize } from "ink";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CommandRegistry, tokenize } from "./commands/registry";
import { createRegistry } from "./commands";
import type { CommandContext, CommandResult } from "./commands/types";
import { SongHeader } from "./components/SongHeader";
import { PatternView } from "./components/PatternView";
import { CommandBar, type Suggestion } from "./components/CommandBar";
import { StatusBar } from "./components/StatusBar";
import { HelpOverlay } from "./components/HelpOverlay";
import { ActionMenu } from "./components/ActionMenu";
import { OrderPicker } from "./components/OrderPicker";
import {
  contextActions,
  type ContextAction,
  type ContextTarget,
} from "./contextActions";
import { MixerOverlay } from "./components/MixerOverlay";
import { SamplesOverlay } from "./components/SamplesOverlay";
import {
  InstrumentsOverlay,
  type InstrumentTab,
} from "./components/InstrumentsOverlay";
import { PatternsOverlay } from "./components/PatternsOverlay";
import { StepPanel } from "./components/StepPanel";
import { FilePicker } from "./components/FilePicker";
import { WebBlockedModal } from "./components/WebBlockedModal";
import { ProgressModal } from "./components/ProgressModal";
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
  trackerActionHint,
  type ExplainerText,
} from "./explainer";
import {
  ParamEditorOverlay,
  type EditorGroup,
} from "./components/ParamEditorOverlay";
import {
  chordGroups,
  defaultWavOutputPath,
  instrumentTabFor,
  masterFxGroups,
  microtexturesGroups,
  percussionGroups,
  samplerGroups,
  songInfoGroups,
  spectralGroups,
  wavExportGroups,
} from "./editors";
import { useSession } from "./hooks";
import { basename, dirname } from "@/runtime/paths";
import { patternGridWidth } from "@/core/tracker";
import type { Session, SessionState } from "./session";

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
    case "chord":
      return "chord";
    case "microtextures":
      return "microtextures";
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
  | "chord"
  | "microtextures"
  | "wav"
  | "filepicker"
  | "webblocked"
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
  /** Context-action popup for the tracker cursor / block (FEAT-88). */
  const [actionTarget, setActionTarget] = useState<ContextTarget | null>(null);
  /** Fast order jump picker (FEAT-91). */
  const [orderPickerOpen, setOrderPickerOpen] = useState(false);
  /** Slot the Source Samples overlay should focus when opened. */
  const [samplesSlot, setSamplesSlot] = useState(0);
  /** Destructive command held back until the user resolves unsaved work. */
  const [pending, setPending] = useState<{
    raw: string;
    description: string;
  } | null>(null);
  /** Recent projects picker (FEAT-94). */
  const [recentPickerOpen, setRecentPickerOpen] = useState(false);
  const [recent, setRecent] = useState<
    Array<{ path: string; exists: boolean }>
  >([]);
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
  /** True while the (potentially slow) stepthrough recipe is being built. */
  const [stepBuilding, setStepBuilding] = useState(false);
  /** Dismissed the "terminal too narrow for the Explainer" advisory this run. */
  const [widthAdvisoryDismissed, setWidthAdvisoryDismissed] = useState(false);
  /** WAV export progress modal (FEAT-156): null when not exporting. */
  const [exporting, setExporting] = useState<{
    label: string;
    fraction: number;
  } | null>(null);
  /** Tree-view picker for the WAV output path (FEAT-158). */
  const [outputPickerOpen, setOutputPickerOpen] = useState(false);
  const inputRef = useRef(input);
  inputRef.current = input;
  const suggestionsRef = useRef(suggestions);
  suggestionsRef.current = suggestions;

  /** Snapshot the stepthrough will rebuild from, held until the modal paints. */
  const stepBuildTarget = useRef<BuildTarget | null>(null);
  const startStepthrough = useCallback(() => {
    const final = session.snapshotTarget();
    if (!final) return;
    setHelpOpen(false);
    // Show the "Generating…" modal first and let it paint; the actual recipe
    // build runs from a passive effect (below) so it can never race ahead of the
    // first paint (FEAT-144 / BUG-42).
    stepBuildTarget.current = final;
    setStepBuilding(true);
  }, [session]);

  // Runs after the modal has been committed and painted. `setTimeout(0)` defers
  // to the next macrotask so a heavy `buildSteps` cannot block the paint.
  useEffect(() => {
    if (!stepBuilding) return;
    const final = stepBuildTarget.current;
    if (!final) {
      setStepBuilding(false);
      return;
    }
    let timer: ReturnType<typeof setTimeout> | null = null;
    // In a browser, wait one animation frame so the "Generating…" modal has
    // definitely painted before the (potentially slow) recipe build starts. In
    // Node (the TUI) requestAnimationFrame does not exist, so defer a tick.
    const build = () => {
      timer = setTimeout(() => {
        const steps = buildSteps(final);
        if (steps.length === 0) {
          setStepBuilding(false);
          session.setStatus("Nothing to rebuild — project is already empty");
          return;
        }
        // Start from a blank project and build it up step by step.
        setStepMode({ steps, base: blankTargetFrom(final), index: 0 });
        session.setStepthrough(true);
        setStepBuilding(false);
        session.setStatus(`Stepthrough: ${steps.length} steps`);
      }, 0);
    };
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(build);
      return () => {
        if (timer !== null) clearTimeout(timer);
      };
    }
    build();
    return () => {
      if (timer !== null) clearTimeout(timer);
    };
  }, [stepBuilding, session]);

  const stopStepthrough = useCallback(() => {
    setStepMode(null);
    setStepBuilding(false);
    session.setStepthrough(false);
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

  // The Explainer panel is chrome around the TUI (HC001); the pattern grid is
  // the product and must never be squeezed narrower than it needs. Ink does not
  // clip an overflowing row, so a pattern wider than its column overruns the
  // panel and leaves the blank "gap rows" reported in the web build. Compute
  // the grid's natural width and hide the panel when it would not fit.
  const panelWidth = columns >= 140 ? 48 : columns >= 110 ? 40 : 30;
  const trackerChannels = Math.min(state.song?.channels.length ?? 0, 4);
  const patternWidth = state.song
    ? patternGridWidth(state.song, trackerChannels, state.cyclesMode)
    : 0;
  // The panel needs about 84 columns; it also may not crowd out the pattern.
  const showExplainer = columns >= 84 && columns - panelWidth >= patternWidth;
  const showWidthAdvisory =
    !widthAdvisoryDismissed && (columns < 84 || columns < patternWidth);

  const ctx = useMemo<CommandContext>(
    () => ({
      session,
      exit,
      listCommands: () => registry.all(),
      print: (text: string) => session.setStatus(text),
      // A command that reports progress (currently WAV export) opens the
      // progress modal even when it was typed directly, e.g. `/export wav x.wav`.
      onProgress: (fraction, label) =>
        setExporting((current) => ({
          label: label ?? current?.label ?? "Working…",
          fraction: Math.max(current?.fraction ?? 0, fraction),
        })),
      openOverlay: (name, arg) => {
        if (name === "filepicker") {
          setOverlay("filepicker");
          return;
        }
        if (name === "stepthrough") {
          if (arg === -1) stopStepthrough();
          else startStepthrough();
          return;
        }
        if (name === "samples") {
          if (arg !== undefined && Number.isFinite(arg)) {
            setSamplesSlot(Math.max(0, Math.round(arg)));
          }
          setReturnToList(false);
          setOverlay("samples");
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

  /** Loads the recent-project list (with existence flags) and opens the picker. */
  const openRecentPicker = useCallback(async () => {
    const config = await session.host.config.read();
    const entries = await Promise.all(
      (config.recentProjects ?? []).map(async (entry) => ({
        path: entry,
        exists: await session.host.fs.fileExists(entry),
      })),
    );
    setRecent(entries);
    setRecentPickerOpen(true);
  }, [session]);

  const runCommand = useCallback(
    async (raw: string) => {
      // Guard destructive commands behind an unsaved-changes prompt (FEAT-93).
      const name = raw.trim().replace(/^\//, "").split(/\s+/)[0] ?? "";
      const def = registry.get(name);
      // Filesystem commands short-circuit to the web-blocked modal in the
      // registry, so skip the local pickers/unsaved prompts on web (FEAT-163).
      const webFsBlocked = !!def?.fs && session.getState().webMode;
      if (!webFsBlocked && def?.id === "recent") {
        void openRecentPicker();
        return;
      }
      if (
        !webFsBlocked &&
        def &&
        ["new", "open", "restore", "quit", "exit"].includes(def.id) &&
        session.getState().dirty &&
        !raw.includes("--force")
      ) {
        setPending({
          raw,
          description:
            def.id === "quit" || def.id === "exit"
              ? "Quit with unsaved changes?"
              : `Run /${def.id} and discard unsaved changes?`,
        });
        return;
      }
      let result: CommandResult;
      try {
        result = await registry.execute(raw, ctx);
      } finally {
        // Any command that showed progress (WAV export) closes its modal here.
        setExporting(null);
      }
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
    [registry, ctx, session, openRecentPicker],
  );

  /**
   * Starts a WAV export and drives the progress modal (FEAT-156). The export
   * itself runs through the command registry so scripts keep the same path; the
   * registry forwards stage progress to `ctx.onProgress`.
   */
  const beginWavExport = useCallback(() => {
    // The Output file param wins; otherwise derive it beside the project.
    const target =
      session.getState().wavExport.outputPath || defaultWavOutputPath(session);
    setOverlay("none");
    setExporting({ label: "Preparing instruments", fraction: 0.02 });
    void (async () => {
      try {
        await runCommand(`/export wav "${target}"`);
      } finally {
        setExporting(null);
      }
    })();
  }, [runCommand, session]);

  /** Runs a context-menu action: commands go through the registry. */
  const runMenuAction = useCallback(
    (action: ContextAction) => {
      setActionTarget(null);
      if (action.special === "order-picker") {
        setOrderPickerOpen(true);
        return;
      }
      if (action.special === "clear-fx") {
        session.setEffectCode(null);
        return;
      }
      if (action.special?.startsWith("set-fx:")) {
        session.setEffectCode(Number(action.special.slice("set-fx:".length)));
        return;
      }
      if (action.command) void runCommand(action.command);
    },
    [runCommand, session],
  );

  const menuActions = useMemo(
    () => (actionTarget ? contextActions(state, actionTarget) : []),
    [actionTarget, state],
  );

  // Global undo/redo while a menu or overlay owns the screen (FEAT-135). The
  // tracker handler covers the no-overlay case; keeping this separate avoids
  // running undo twice when both would otherwise be active.
  useInput(
    (char, key) => {
      if (!key.ctrl) return;
      if (char === "z") {
        session.undo();
        return;
      }
      if (char === "y") session.redo();
    },
    {
      isActive:
        (overlay !== "none" && overlay !== "patterns") ||
        helpOpen ||
        stepMode !== null ||
        actionTarget !== null ||
        orderPickerOpen ||
        recentPickerOpen ||
        pending !== null,
    },
  );

  const resolvePending = useCallback(
    (action: ContextAction) => {
      const current = pending;
      setPending(null);
      if (!current) return;
      if (action.special === "confirm-cancel") return;
      if (action.special === "confirm-discard") {
        void runCommand(`${current.raw} --force`);
        return;
      }
      if (action.special === "confirm-save") {
        const target = session.getState().projectPath;
        if (!target) {
          setPaletteOpen(true);
          setInput("/save ");
          return;
        }
        void (async () => {
          await runCommand(`/save "${target}"`);
          await runCommand(`${current.raw} --force`);
        })();
      }
    },
    [pending, runCommand, session],
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
      const raw = input.replace(/^[/:]/, "");
      const tokens = tokenize(raw);
      const trailing = /\s$/.test(raw);
      if (!trailing && tokens.length <= 1) {
        const query = tokens[0] ?? "";
        const usageFor = (command: {
          name: string;
          args?: Array<{ name: string; required?: boolean }>;
        }) => {
          const args = (command.args ?? [])
            .map((a) => (a.required ? `<${a.name}>` : `[${a.name}]`))
            .join(" ");
          return `/${command.name}${args ? ` ${args}` : ""}`;
        };
        const commandItems = registry
          .suggest(query, 8)
          .map<Suggestion>((command) => ({
            label: `/${command.name}`,
            description: command.description,
            insert: `/${command.name} `,
            replaceFrom: 0,
            kind: "command" as const,
            usage: usageFor(command),
            example: command.examples?.[0],
          }));
        // When the query is empty, surface recently used commands first.
        const recentItems: Suggestion[] = query
          ? []
          : [
              ...new Set(
                [...session.getState().commandHistory]
                  .reverse()
                  .map(
                    (line) =>
                      line.trim().replace(/^[/:]/, "").split(/\s+/)[0] ?? "",
                  )
                  .filter(Boolean),
              ),
            ]
              .slice(0, 5)
              .map((name) => registry.get(name))
              .filter((command) => command !== undefined)
              .map<Suggestion>((command) => ({
                label: `/${command.name}`,
                description: command.description,
                insert: `/${command.name} `,
                replaceFrom: 0,
                kind: "recent" as const,
                usage: usageFor(command),
                example: command.examples?.[0],
              }));
        const seen = new Set<string>();
        const items = [...recentItems, ...commandItems].filter((item) => {
          if (seen.has(item.label)) return false;
          seen.add(item.label);
          return true;
        });
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
      let candidates: string[];
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
  }, [input, paletteOpen, registry, ctx, rows, session]);

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
          // the command name is complete it executes. When the top suggestion
          // takes no required arguments, complete AND run it in one press
          // (FEAT-142), e.g. /in + Enter → /info.
          if (
            registry.enterAction(
              inputRef.current,
              suggestionsRef.current.length > 0,
            ) === "complete"
          ) {
            const top = registry.topSuggestion(inputRef.current);
            if (top && !CommandRegistry.hasRequiredArgs(top)) {
              void runCommand(`/${top.name}`);
              return;
            }
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
      // ':' is an alias that opens the palette with an empty query.
      if (char === ":") {
        setPaletteOpen(true);
        setInput("");
        return;
      }
      if (char === "?") {
        setHelpOpen(true);
        return;
      }
      // Enter opens the context-action menu for the cursor cell (FEAT-88).
      if (key.return) {
        setActionTarget({
          kind: "tracker",
          channel: state.cursor.channel,
          order: state.cursor.order,
          row: state.cursor.row,
          column: state.cursor.column,
        });
        return;
      }
      // o: fast "go to order" picker (FEAT-91).
      if (char === "o") {
        setOrderPickerOpen(true);
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
      // i: open the Instruments panel (the full instrument list).
      if (char === "i" || char === "I") {
        setReturnToList(false);
        setOverlay("instruments");
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
      // Clipboard (FEAT-145). Ctrl+C / Ctrl+X / Ctrl+V are the primary
      // copy/cut/paste keys; the old Ctrl+Shift+C/X/V aliases are kept for
      // muscle memory. Ctrl+C no longer quits — use /quit or /exit.
      const ctrlShift = (letter: string) =>
        key.ctrl && key.shift && char?.toLowerCase() === letter;
      if (ctrlShift("s")) {
        setPaletteOpen(true);
        setInput("/save-as ");
        return;
      }
      if (ctrlShift("c") || (key.ctrl && char === "c")) {
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
      // L: toggle repeating the viewed order while editing (FEAT-95).
      if (char === "L") {
        const looping = session.toggleOrderLoop();
        session.setStatus(looping ? "Loop: viewed order" : "Loop: whole song");
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
      // There is no keyboard note entry: `z` places the last value/note, and
      // notes are entered with the /note command or pasted from elsewhere.
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
      if (char === "C") {
        session.toggleCyclesMode();
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
      if (char === "p") {
        setOverlay("patterns");
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
    },
    {
      isActive:
        overlay === "none" &&
        !helpOpen &&
        !stepMode &&
        !stepBuilding &&
        !exporting &&
        !showWidthAdvisory &&
        !actionTarget &&
        !orderPickerOpen &&
        !pending &&
        !recentPickerOpen,
    },
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
      // Category jumps: Ctrl+↑/↓ (FEAT-144).
      if (key.ctrl && (key.upArrow || key.downArrow)) {
        const direction = key.upArrow ? -1 : 1;
        setStepMode((mode) =>
          mode
            ? { ...mode, index: jumpChapter(mode.steps, mode.index, direction) }
            : mode,
        );
        return;
      }
      // Ten steps at a time: ←/→ (FEAT-144).
      if (key.leftArrow || key.rightArrow) {
        const delta = key.leftArrow ? -10 : 10;
        setStepMode((mode) =>
          mode
            ? {
                ...mode,
                index: Math.min(
                  Math.max(mode.index + delta, 0),
                  mode.steps.length - 1,
                ),
              }
            : mode,
        );
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
  const channelPlayheads = state.playing ? session.channelPlayheads() : null;

  const trackerExplainer = useMemo(() => explainCursor(state), [state]);
  const editorHint =
    overlay === "fx"
      ? "↑↓ select · ctrl+↑↓ cat · ←→ adj · ctrl+←→ big · enter type · p preview · / filter · r reset · esc"
      : "↑↓ select · ctrl+↑↓ cat · ←→ adj · ctrl+←→ big · enter type · p preview · [ ] mode · , . ins · / filter · r reset · esc";
  const explainer: ExplainerText = helpOpen
    ? {
        title: "Help — commands & keys",
        body: "Browse every slash command and EDIT MODE shortcut. Ctrl+↑/↓ jumps between command categories.",
      }
    : overlay === "none"
      ? trackerExplainer
      : menuExplainer;
  const showPanel = stepMode !== null || showExplainer;
  // Any key dismisses the narrow-terminal advisory (FEAT-137).
  useInput(() => setWidthAdvisoryDismissed(true), {
    isActive: showWidthAdvisory,
  });
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
          : activeOverlay === "chord"
            ? chordGroups(session, activeInstrument, settingsOverride)
            : activeOverlay === "microtextures"
              ? microtexturesGroups(session, activeInstrument, settingsOverride)
              : activeOverlay === "fx"
                ? masterFxGroups(session, stepTarget?.masterFx)
                : null;
  const editorTitle =
    activeOverlay === "sampler"
      ? `SAMPLER-CORE — ${instrumentLabel}`
      : activeOverlay === "spectral"
        ? `Spectral — ${instrumentLabel}`
        : activeOverlay === "percussion"
          ? `Percussion — ${instrumentLabel}`
          : activeOverlay === "chord"
            ? `Chord — ${instrumentLabel}`
            : activeOverlay === "microtextures"
              ? `MicroTextures — ${instrumentLabel}`
              : "Master FX";
  const songGroups =
    activeOverlay === "song" && !stepMode ? songInfoGroups(session) : null;
  const wavGroups =
    activeOverlay === "wav" && !stepMode
      ? wavExportGroups(session, beginWavExport, () =>
          setOutputPickerOpen(true),
        )
      : null;
  const currentOutputPath =
    session.getState().wavExport.outputPath || defaultWavOutputPath(session);
  const instrumentTabs: InstrumentTab[] = [
    "sampler",
    "spectral",
    "percussion",
    "chord",
    "microtextures",
  ];
  const editorTabs =
    editorGroups && activeOverlay !== "fx"
      ? {
          labels: [
            "SAMPLER-CORE",
            "Spectral",
            "Percussion",
            "Chord",
            "MicroTx",
          ],
          active: Math.max(
            instrumentTabs.indexOf(activeOverlay as InstrumentTab),
            0,
          ),
          onSelect: (index: number) =>
            setOverlay(instrumentTabs[index] ?? "sampler"),
          highlight: [
            // The core sampler stage is always active.
            true,
            !!state.settings[activeInstrument]?.spectral.enabled,
            !!state.settings[activeInstrument]?.spectral.percussion.enabled,
            !!state.settings[activeInstrument]?.chord.enabled,
            !!state.settings[activeInstrument]?.spectral.microTextures.enabled,
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
          hint: "↑↓ step · ←→ ±10 · ctrl+↑↓/pgup/pgdn chapter · home/end · esc exit",
        }
      : helpOpen
        ? {
            title: "Help — commands & keys",
            hint: "↑↓/jk scroll · ctrl+↑↓ category · space/PgDn page · esc close",
          }
        : editorGroups
          ? { title: editorTitle, hint: editorHint }
          : songGroups
            ? {
                title: "Song Info",
                hint: "↑↓ select · ←→ adjust · enter type · esc close",
              }
            : activeOverlay === "mixer"
              ? {
                  title: "Mixer / Master FX",
                  hint: "↑↓ select · ctrl+↑↓ category · ←→ adjust · m mute/toggle · esc close",
                }
              : outputPickerOpen
                ? {
                    title: "Choose output file",
                    hint: "↑↓ select · enter open dir/overwrite · ←/backspace up · n name · s save · x/esc cancel",
                  }
                : activeOverlay === "webblocked"
                  ? {
                      title: "Not available in the web version",
                      hint: "x/esc close · download the desktop version from the link",
                    }
                  : activeOverlay === "filepicker"
                    ? {
                        title: "Open project",
                        hint: "↑↓ select · enter/→ open · ←/backspace up · z open · x/esc cancel",
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
                              hint: "↑↓ select · shift+↑↓/J/K move · a add · d duplicate · del remove · e number · enter/z settings · g jump · esc close",
                            }
                          : null;

  return (
    <Box flexDirection="column" width={columns} height={rows}>
      <SongHeader state={state} playhead={playhead} context={menuContext} />
      <Box flexDirection="row" flexGrow={1}>
        <Box flexDirection="column" flexGrow={1}>
          {exporting ? (
            <ProgressModal
              title="Exporting…"
              label={exporting.label}
              fraction={exporting.fraction}
              width={Math.max(16, contentWidth - 10)}
            />
          ) : showWidthAdvisory ? (
            <Box
              flexDirection="column"
              borderStyle="round"
              borderColor="yellow"
              paddingX={2}
              paddingY={1}
              alignSelf="flex-start"
            >
              <Text bold color="yellow">
                Terminal is a bit narrow
              </Text>
              <Text wrap="wrap">
                The pattern grid needs about {patternWidth} columns for this
                song and the Explainer panel about 84. Widen the window to fit
                the full tracker — nothing is hidden behind this notice.
              </Text>
              <Text dimColor>press any key to continue</Text>
            </Box>
          ) : stepBuilding ? (
            <Box
              flexDirection="column"
              borderStyle="round"
              borderColor="yellow"
              paddingX={2}
              paddingY={1}
              alignSelf="flex-start"
            >
              <Text bold color="yellow">
                Generating Stepthrough Recipe…
              </Text>
              <Text dimColor>
                Analysing the project and composing the rebuild steps.
              </Text>
            </Box>
          ) : actionTarget ? (
            <ActionMenu
              title="Actions for this cell"
              actions={menuActions}
              active
              height={viewportRows}
              width={contentWidth}
              onExplain={setMenuExplainer}
              onClose={() => setActionTarget(null)}
              onRun={runMenuAction}
            />
          ) : orderPickerOpen ? (
            <OrderPicker
              session={session}
              active
              height={contentHeight}
              onClose={() => setOrderPickerOpen(false)}
            />
          ) : pending ? (
            <ActionMenu
              title={pending.description}
              actions={[
                {
                  id: "confirm-save",
                  label: "Save and continue",
                  special: "confirm-save",
                  enabled: !!session.getState().projectPath,
                  hint: session.getState().projectPath
                    ? undefined
                    : "(no path yet)",
                },
                {
                  id: "confirm-discard",
                  label: "Discard changes and continue",
                  special: "confirm-discard",
                },
                {
                  id: "confirm-cancel",
                  label: "Cancel",
                  special: "confirm-cancel",
                },
              ]}
              active
              height={viewportRows}
              width={contentWidth}
              onExplain={setMenuExplainer}
              onClose={() => setPending(null)}
              onRun={resolvePending}
            />
          ) : recentPickerOpen ? (
            <ActionMenu
              title="Recent projects"
              actions={recent.map((entry, index) => ({
                id: `recent-${index}`,
                label: entry.path,
                command: `/open "${entry.path}"`,
                enabled: entry.exists,
                hint: entry.exists ? undefined : "(missing)",
              }))}
              active
              height={viewportRows}
              width={contentWidth}
              onExplain={setMenuExplainer}
              onClose={() => setRecentPickerOpen(false)}
              onRun={(action) => {
                setRecentPickerOpen(false);
                if (action.command) void runCommand(action.command);
              }}
            />
          ) : helpOpen ? (
            <HelpOverlay
              commands={registry.all()}
              active={helpOpen}
              height={viewportRows}
              width={contentWidth}
              onClose={() => setHelpOpen(false)}
            />
          ) : activeOverlay === "song" && stepMode ? (
            <SongInfoPanel state={state} highlight={paramHighlights} />
          ) : activeOverlay === "song" && songGroups ? (
            <ParamEditorOverlay
              title="Song Info"
              groups={songGroups}
              active={!stepMode}
              height={viewportRows}
              onClose={() => setOverlay("none")}
              onExplain={setMenuExplainer}
              highlight={paramHighlights}
            />
          ) : outputPickerOpen ? (
            <FilePicker
              session={session}
              active={outputPickerOpen}
              mode="save"
              width={contentWidth}
              height={contentHeight}
              initialDirectory={dirname(currentOutputPath)}
              initialFilename={basename(currentOutputPath)}
              onSelect={(path) => {
                session.setWavExport({ outputPath: path });
                setOutputPickerOpen(false);
              }}
              onClose={() => setOutputPickerOpen(false)}
            />
          ) : wavGroups ? (
            <ParamEditorOverlay
              title="Export WAV"
              groups={wavGroups}
              active={!stepMode}
              height={viewportRows}
              onClose={() => setOverlay("none")}
              onExplain={setMenuExplainer}
              submit={{
                key: "e",
                label: "Export",
                run: beginWavExport,
              }}
            />
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
              onCommand={(line) => void runCommand(line)}
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
          ) : activeOverlay === "webblocked" ? (
            <WebBlockedModal
              width={contentWidth}
              onClose={() => setOverlay("none")}
            />
          ) : activeOverlay === "filepicker" ? (
            <FilePicker
              session={session}
              active={activeOverlay === "filepicker"}
              mode="open"
              onClose={() => setOverlay("none")}
              width={contentWidth}
              height={contentHeight}
              onSelect={(path) => {
                setOverlay("none");
                void runCommand(`/open "${path}"`);
              }}
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
              initialSlot={samplesSlot}
              onCommand={(line) => void runCommand(line)}
              onImportSample={(slot) => {
                setOverlay("none");
                setPaletteOpen(true);
                setInput(`/importsample ${slot} `);
              }}
            />
          ) : (
            <PatternView
              state={state}
              viewportRows={viewportRows}
              playhead={stepMode ? null : playhead}
              playheads={stepMode ? null : channelPlayheads}
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
        width={contentWidth}
        hint={
          menuContext?.hint ??
          (stepMode
            ? "↑↓ step · pgup/pgdn chapter · esc exit"
            : trackerActionHint(state))
        }
      />
      <CommandBar
        input={input}
        active={paletteOpen}
        placeholder="type / for commands…"
        suggestions={suggestions}
        selected={selected}
        width={contentWidth}
      />
    </Box>
  );
}
