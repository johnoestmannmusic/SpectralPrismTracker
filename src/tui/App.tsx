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
import { useSession } from "./hooks";
import type { Session } from "./session";

/** Keyboard -> semitone offsets, classic tracker layout. */
const NOTE_KEYS: Record<string, number> = {
  z: 0,
  s: 1,
  x: 2,
  d: 3,
  c: 4,
  v: 5,
  g: 6,
  b: 7,
  h: 8,
  n: 9,
  j: 10,
  m: 11,
  ",": 12,
  l: 13,
  ".": 14,
};

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
    }),
    [session, exit, registry],
  );

  const runCommand = useCallback(
    async (raw: string) => {
      const result = await registry.execute(raw, ctx);
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

  // Command/arg suggestions (async because path completion hits the fs).
  useEffect(() => {
    if (!paletteOpen) {
      setSuggestions([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      const raw = input.startsWith("/") ? input.slice(1) : input;
      const tokens = tokenize(raw);
      const trailing = /\s$/.test(raw);
      if (!trailing) {
        const query = tokens[0] ?? "";
        const items = registry.suggest(query, 8).map<Suggestion>((command) => ({
          label: `/${command.name}`,
          description: command.description,
          insert: `/${command.name} `,
          replaceFrom: 0,
        }));
        if (!cancelled) {
          setSuggestions(items);
          setSelected(0);
        }
        return;
      }
      const def = registry.get(tokens[0] ?? "");
      if (!def) {
        if (!cancelled) setSuggestions([]);
        return;
      }
      const argIndex = tokens.length - 1;
      const arg = def.args?.[argIndex];
      if (!arg) {
        if (!cancelled) setSuggestions([]);
        return;
      }
      let candidates: string[] = [];
      try {
        candidates = await registry.completeArg(def, argIndex, "", ctx);
      } catch {
        candidates = [];
      }
      if (!cancelled) {
        setSuggestions(
          candidates.slice(0, 10).map((candidate) => ({
            label: candidate,
            description: arg.description,
            insert: candidate,
            replaceFrom: input.length,
          })),
        );
        setSelected(0);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [input, paletteOpen, registry, ctx]);

  const applySuggestion = useCallback(() => {
    const items = suggestionsRef.current;
    const suggestion = items[selected];
    if (!suggestion) return;
    setInput(
      (current) => current.slice(0, suggestion.replaceFrom) + suggestion.insert,
    );
  }, [selected]);

  useInput((char, key) => {
    if (helpOpen) {
      if (key.escape || char === "q") setHelpOpen(false);
      return;
    }

    if (paletteOpen) {
      if (key.escape) {
        setPaletteOpen(false);
        setInput("");
        return;
      }
      if (key.return) {
        void runCommand(inputRef.current);
        return;
      }
      if (key.tab) {
        applySuggestion();
        return;
      }
      if (key.upArrow) {
        setSelected((index) => Math.max(0, index - 1));
        return;
      }
      if (key.downArrow) {
        setSelected((index) =>
          Math.min(suggestionsRef.current.length - 1, index + 1),
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
    if (char === "/") {
      setPaletteOpen(true);
      setInput("/");
      return;
    }
    if (char === "?") {
      setHelpOpen(true);
      return;
    }
    if (key.ctrl && char === "z") {
      session.undo();
      return;
    }
    if (key.ctrl && (char === "y" || char === "r")) {
      session.redo();
      return;
    }
    if (key.tab) {
      session.moveCursor({ channel: 1 });
      return;
    }
    if (key.upArrow) {
      session.moveCursor(key.shift ? { row: -16 } : { row: -1 });
      return;
    }
    if (key.downArrow) {
      session.moveCursor(key.shift ? { row: 16 } : { row: 1 });
      return;
    }
    if (key.leftArrow) {
      session.moveCursor({ column: -1 });
      return;
    }
    if (key.rightArrow) {
      session.moveCursor({ column: 1 });
      return;
    }
    if (key.pageUp) {
      session.moveCursor({ order: -1 });
      return;
    }
    if (key.pageDown) {
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
    if (char === "+" || char === "=") {
      session.setLastOctave(session.lastOctaveValue + 1);
      return;
    }
    if (char === "-" || char === "_") {
      session.setLastOctave(session.lastOctaveValue - 1);
      return;
    }
    if (char === "q") {
      exit();
      return;
    }
    const semitone = NOTE_KEYS[char];
    if (semitone !== undefined) {
      const note = 60 + session.lastOctaveValue * 12 + semitone;
      session.editCell({ note: { kind: "note", note } });
    }
  });

  const viewportRows = Math.max(4, rows - 11);
  const playhead = state.playing ? session.playheadPosition() : null;

  return (
    <Box flexDirection="column" width={columns} height={rows}>
      <SongHeader state={state} playhead={playhead} />
      {helpOpen ? (
        <HelpOverlay commands={registry.all()} />
      ) : (
        <PatternView
          state={state}
          viewportRows={viewportRows}
          playhead={playhead}
        />
      )}
      <StatusBar
        status={state.status}
        error={state.error}
        hint={
          state.error
            ? "any key to focus · type / for commands"
            : "space play · / commands · ? help · q quit"
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
