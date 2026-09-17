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
import { ExplainerPanel } from "./components/ExplainerPanel";
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
  masterFxGroups,
  percussionGroups,
  samplerGroups,
  spectralGroups,
} from "./editors";
import { useSession } from "./hooks";
import type { Session } from "./session";

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

type Overlay =
  | "none"
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
  const state = useSession(session);
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
  const [menuExplainer, setMenuExplainer] =
    useState<ExplainerText>(DEFAULT_EXPLAINER);
  const inputRef = useRef(input);
  inputRef.current = input;
  const suggestionsRef = useRef(suggestions);
  suggestionsRef.current = suggestions;

  const ctx = useMemo<CommandContext>(
    () => ({
      session,
      exit,
      listCommands: () => registry.all(),
      print: (text: string) => session.setStatus(text),
      openOverlay: (name, arg) => {
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
    [session, exit, registry],
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
      if (key.escape) {
        session.clearSelection();
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
      // Clipboard.
      if (key.ctrl && char === "c") {
        session.copySelection();
        return;
      }
      if (key.ctrl && char === "x") {
        session.cutSelection();
        return;
      }
      if (key.ctrl && char === "v") {
        session.pasteSelection(key.shift);
        return;
      }
      if (key.ctrl && char === "a") {
        session.selectAll();
        return;
      }
      // Ctrl+arrows: jump 16 rows (wrapping orders) / jump channel (NOTE).
      if (key.ctrl && key.upArrow) {
        session.moveCursor({ row: -16 });
        return;
      }
      if (key.ctrl && key.downArrow) {
        session.moveCursor({ row: 16 });
        return;
      }
      if (key.ctrl && key.leftArrow) {
        session.moveCursor({ channel: -1 });
        return;
      }
      if (key.ctrl && key.rightArrow) {
        session.moveCursor({ channel: 1 });
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
        if (key.shift) session.extendSelection({ row: -1 });
        else session.moveCursor({ row: -1 });
        return;
      }
      if (key.downArrow) {
        if (key.shift) session.extendSelection({ row: 1 });
        else session.moveCursor({ row: 1 });
        return;
      }
      if (key.leftArrow) {
        if (key.shift) session.extendSelection({ column: -1 });
        else session.moveCursor({ column: -1 });
        return;
      }
      if (key.rightArrow) {
        if (key.shift) session.extendSelection({ column: 1 });
        else session.moveCursor({ column: 1 });
        return;
      }
      if (key.pageUp) {
        if (key.shift) session.extendSelection({ order: -1 });
        else session.moveCursor({ order: -1 });
        return;
      }
      if (key.pageDown) {
        if (key.shift) session.extendSelection({ order: 1 });
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
    { isActive: overlay === "none" && !helpOpen },
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
  const panelWidth = columns >= 140 ? 48 : columns >= 110 ? 40 : 30;
  const contentHeight = viewportRows + 2;
  const contentWidth = columns - (showExplainer ? panelWidth : 0);

  const instrumentCount = state.song?.instruments.length ?? 0;
  const instrumentLabel =
    state.song?.instruments[editInstrument]?.name ??
    `Instrument ${editInstrument}`;
  const editorGroups: EditorGroup[] | null =
    overlay === "sampler"
      ? samplerGroups(session, editInstrument)
      : overlay === "spectral"
        ? spectralGroups(session, editInstrument)
        : overlay === "percussion"
          ? percussionGroups(session, editInstrument)
          : overlay === "fx"
            ? masterFxGroups(session)
            : null;
  const editorTitle =
    overlay === "sampler"
      ? `Sampler — ${instrumentLabel}`
      : overlay === "spectral"
        ? `Spectral — ${instrumentLabel}`
        : overlay === "percussion"
          ? `Percussion — ${instrumentLabel}`
          : "Master FX";
  const instrumentTabs: InstrumentTab[] = ["sampler", "spectral", "percussion"];
  const editorTabs =
    editorGroups && overlay !== "fx"
      ? {
          labels: ["Sampler", "Spectral", "Percussion"],
          active: Math.max(instrumentTabs.indexOf(overlay as InstrumentTab), 0),
          onSelect: (index: number) =>
            setOverlay(instrumentTabs[index] ?? "sampler"),
          highlight: [
            false,
            !!state.settings[editInstrument]?.spectral.enabled,
            !!state.settings[editInstrument]?.spectral.percussion.enabled,
          ],
        }
      : undefined;
  const stepInstrument = (direction: 1 | -1) => {
    if (instrumentCount === 0) return;
    setEditInstrument((index) =>
      Math.min(Math.max(index + direction, 0), instrumentCount - 1),
    );
  };

  const menuContext = helpOpen
    ? {
        title: "Help — commands & keys",
        hint: "↑↓/jk scroll · ctrl+↑↓ category · space/PgDn page · esc close",
      }
    : editorGroups
      ? { title: editorTitle, hint: editorHint }
      : overlay === "mixer"
        ? {
            title: "Mixer / Master FX",
            hint: "↑↓ select · ctrl+↑↓ category · ←→ adjust · m mute/toggle · esc close",
          }
        : overlay === "samples"
          ? {
              title: "Source Samples",
              hint: "↑↓ select · p preview · enter edit info · esc close",
            }
          : overlay === "instruments"
            ? {
                title: "Instruments",
                hint: "↑↓ select · 1/2/3 sampler/spectral/percussion · enter sampler · m mute · p preview · esc close",
              }
            : overlay === "patterns"
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
          ) : editorGroups ? (
            <ParamEditorOverlay
              title={editorTitle}
              groups={editorGroups}
              active={overlay !== "none"}
              height={viewportRows}
              onClose={() => setOverlay(returnToList ? "instruments" : "none")}
              onExplain={setMenuExplainer}
              onPreview={
                overlay === "fx"
                  ? undefined
                  : () => void session.previewAfterRender(editInstrument)
              }
              onPrev={overlay === "fx" ? undefined : () => stepInstrument(-1)}
              onNext={overlay === "fx" ? undefined : () => stepInstrument(1)}
              tabs={editorTabs}
              hint={editorHint}
            />
          ) : overlay === "instruments" ? (
            <InstrumentsOverlay
              session={session}
              active={overlay === "instruments"}
              onClose={() => setOverlay("none")}
              onOpen={(index, tab) => {
                setEditInstrument(index);
                setReturnToList(true);
                setOverlay(tab);
              }}
              onExplain={setMenuExplainer}
              height={contentHeight}
            />
          ) : overlay === "patterns" ? (
            <PatternsOverlay
              session={session}
              active={overlay === "patterns"}
              onClose={() => setOverlay("none")}
              onExplain={setMenuExplainer}
              height={contentHeight}
            />
          ) : overlay === "mixer" ? (
            <MixerOverlay
              session={session}
              active={overlay === "mixer"}
              onClose={() => setOverlay("none")}
              onExplain={setMenuExplainer}
            />
          ) : overlay === "samples" ? (
            <SamplesOverlay
              session={session}
              active={overlay === "samples"}
              onClose={() => setOverlay("none")}
              onExplain={setMenuExplainer}
              width={contentWidth}
              height={contentHeight}
            />
          ) : (
            <PatternView
              state={state}
              viewportRows={viewportRows}
              playhead={playhead}
              selection={session.selection()}
            />
          )}
        </Box>
        {showExplainer ? (
          <ExplainerPanel
            content={explainer}
            width={panelWidth}
            height={contentHeight}
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
