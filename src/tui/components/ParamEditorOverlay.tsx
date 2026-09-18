import { Box, Text, useInput } from "ink";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { DEFAULT_EXPLAINER, type ExplainerText } from "../explainer";

export interface EditorParam {
  label: string;
  kind: "number" | "toggle" | "enum" | "text";
  value: number | boolean | string;
  min?: number;
  max?: number;
  step?: number;
  integer?: boolean;
  choices?: string[];
  unit?: string;
  format?: (value: number | boolean | string) => string;
  set: (value: number | boolean | string) => void;
  /** Ask the host to audition after the change (spectral/percussion). */
  preview?: boolean;
  /** Short explanation shown in the right-hand explainer panel. */
  explain?: string;
}

export interface EditorGroup {
  title: string;
  params: EditorParam[];
  graph?: ReactNode;
}

interface Props {
  title: string;
  groups: EditorGroup[];
  active: boolean;
  onClose: () => void;
  onPreview?: () => void;
  hint?: string;
  onPrev?: () => void;
  onNext?: () => void;
  /** Optional primary action fired by `key` (e.g. the WAV export modal). */
  submit?: { key: string; label: string; run: () => void };
  /** Receives the highlighted setting for the right-hand explainer panel. */
  onExplain?: (content: ExplainerText) => void;
  /** Optional tab bar (e.g. Sampler / Spectral / Percussion). */
  tabs?: {
    labels: string[];
    active: number;
    onSelect: (index: number) => void;
    /** Per-tab flag to bold/colour the tab when its mode is enabled. */
    highlight?: boolean[];
  };
  /** Stepthrough target parameters to mark. */
  highlight?: Array<{ group?: string; label?: string }>;
  /** Rows available to the overlay (excludes app header/status/command bar). */
  height: number;
}

function describeParam(groupTitle: string, param: EditorParam): ExplainerText {
  const body: string[] = [];
  if (groupTitle) body.push(`${groupTitle}.`);
  if (param.explain) body.push(param.explain);
  if (param.kind === "number") {
    const bits: string[] = [];
    if (param.min !== undefined || param.max !== undefined)
      bits.push(
        `range ${param.min ?? "–"}–${param.max ?? "–"}${param.unit ? ` ${param.unit}` : ""}`,
      );
    bits.push(`step ${param.step ?? 1}`);
    body.push(
      `←→ adjust, Ctrl+←→ ×10 (${bits.join(", ")}). Enter types a value.`,
    );
  } else if (param.kind === "toggle") {
    body.push("←→ toggles on/off. Enter types on/off.");
  } else if (param.kind === "text") {
    body.push("Enter to type a name.");
  } else {
    body.push(
      `←→ cycles: ${(param.choices ?? []).join(", ")}. Enter types a value.`,
    );
  }
  return { title: `${groupTitle} · ${param.label}`, body: body.join("\n") };
}

type Row =
  | { kind: "header"; text: string; groupIndex: number }
  | { kind: "graph"; node: ReactNode; groupIndex: number }
  | { kind: "param"; param: EditorParam; flat: number; groupIndex: number }
  | { kind: "blank" };

function clamp(value: number, min?: number, max?: number): number {
  if (min !== undefined) value = Math.max(value, min);
  if (max !== undefined) value = Math.min(value, max);
  return value;
}

function displayValue(param: EditorParam): string {
  if (param.format) return param.format(param.value);
  if (param.kind === "text") return String(param.value);
  if (param.kind === "toggle") return param.value ? "on" : "off";
  if (param.kind === "enum") return String(param.value) || "-";
  const value = param.value as number;
  const text = param.integer
    ? String(Math.round(value))
    : value.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
  return param.unit ? `${text}${param.unit}` : text;
}

function proportion(param: EditorParam): number | null {
  if (param.kind !== "number") return null;
  if (
    param.min === undefined ||
    param.max === undefined ||
    param.max <= param.min
  )
    return null;
  const ratio = ((param.value as number) - param.min) / (param.max - param.min);
  // Clamp: a preset can hold a value outside the editor's slider range, which
  // otherwise makes the bar's `"░".repeat(12 - n)` count negative.
  return Math.min(Math.max(ratio, 0), 1);
}

/** Multiplier applied to `step` when Ctrl+←/→ is held. */
const LARGE_STEP_FACTOR = 10;

/** Seed text for the inline value-entry buffer. */
export function initialEditText(param: EditorParam): string {
  if (param.kind === "text") return String(param.value);
  if (param.kind === "toggle") return param.value ? "on" : "off";
  if (param.kind === "enum") return String(param.value);
  const value = param.value as number;
  return param.integer ? String(Math.round(value)) : String(value);
}

/** Parses typed text for a parameter, or null when it is not valid. */
export function parseEditText(
  param: EditorParam,
  text: string,
): number | boolean | string | null {
  const trimmed = text.trim();
  if (param.kind === "text") return trimmed === "" ? null : trimmed;
  if (param.kind === "number") {
    if (trimmed === "") return null;
    const value = Number(trimmed);
    if (!Number.isFinite(value)) return null;
    const clamped = clamp(
      param.integer ? Math.round(value) : value,
      param.min,
      param.max,
    );
    return param.integer ? Math.round(clamped) : clamped;
  }
  if (param.kind === "toggle") {
    const lower = trimmed.toLowerCase();
    if (["on", "true", "1", "yes", "y"].includes(lower)) return true;
    if (["off", "false", "0", "no", "n"].includes(lower)) return false;
    return null;
  }
  const choices = param.choices ?? [];
  const exact = choices.find((choice) => choice === trimmed);
  if (exact !== undefined) return exact;
  const insensitive = choices.findIndex(
    (choice) => choice.toLowerCase() === trimmed.toLowerCase(),
  );
  if (insensitive >= 0) return choices[insensitive]!;
  const index = Number(trimmed);
  if (Number.isInteger(index) && index >= 0 && index < choices.length)
    return choices[index]!;
  return null;
}

/**
 * Keyboard-driven parameter editor used by the sampler, spectral, percussion
 * and master-FX overlays. Params are supplied as live closures, so edits apply
 * straight to the session; `preview: true` params debounce an audition so
 * spectral/percussion tweaks are heard without leaving the editor (FEAT-16).
 * The list scrolls so the selected row is always visible.
 */
export function ParamEditorOverlay({
  title,
  groups,
  active,
  onClose,
  onPreview,
  hint,
  onPrev,
  onNext,
  onExplain,
  submit,
  tabs,
  highlight,
  height,
}: Props) {
  const [filter, setFilter] = useState("");
  const [filterEditing, setFilterEditing] = useState(false);
  /** Values as they were when this editor/tab opened, for "modified" + reset. */
  const baseline = useRef(new Map<string, number | boolean | string>());
  useEffect(() => {
    const map = new Map<string, number | boolean | string>();
    for (const group of groups)
      for (const param of group.params)
        map.set(`${group.title}::${param.label}`, param.value);
    baseline.current = map;
    // Re-baseline when switching instrument/tab.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, tabs?.active]);

  const matchFilter = (groupTitle: string, label: string) => {
    const query = filter.trim().toLowerCase();
    if (!query) return true;
    return `${groupTitle} ${label}`.toLowerCase().includes(query);
  };
  const shownGroups = filter.trim()
    ? groups.map((group) => ({
        ...group,
        params: group.params.filter((param) =>
          matchFilter(group.title, param.label),
        ),
      }))
    : groups;
  const flat = shownGroups.flatMap((group, groupIndex) =>
    group.params.map((param) => ({ groupIndex, param })),
  );
  // Flat index of each group's first param, for Ctrl+↑/↓ category skips.
  const groupFirstFlat: number[] = [];
  {
    let cursor = 0;
    for (const group of shownGroups) {
      groupFirstFlat.push(cursor);
      cursor += group.params.length;
    }
  }
  const rows: Row[] = [];
  let flatIndex = 0;
  shownGroups.forEach((group, groupIndex) => {
    rows.push({ kind: "header", text: group.title, groupIndex });
    if (group.graph)
      rows.push({ kind: "graph", node: group.graph, groupIndex });
    for (const param of group.params) {
      rows.push({ kind: "param", param, flat: flatIndex++, groupIndex });
    }
    rows.push({ kind: "blank" });
  });

  const [selected, setSelected] = useState(0);
  const [editing, setEditing] = useState<string | null>(null);
  /** Open enum chooser popup (Enter on an enum). */
  const [choosing, setChoosing] = useState<{
    options: string[];
    index: number;
  } | null>(null);
  const previewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const current = flat[Math.max(0, Math.min(selected, flat.length - 1))];
  const selectedGroup = current?.groupIndex ?? 0;

  // Scroll so the selected param stays on screen.
  // Chrome rows that are not part of the scrollable param list: border (2),
  // title (1), hint (1), plus the tab bar and filter line when shown. Counting
  // these keeps the last rows from being clipped by the box border.
  const chromeRows = 3 + (tabs ? 1 : 0) + (filterEditing || filter ? 1 : 0);
  const visibleRows = Math.max(4, height - chromeRows);
  const selectedRow = rows.findIndex(
    (row) => row.kind === "param" && row.flat === selected,
  );
  let offset = 0;
  if (selectedRow >= visibleRows) offset = selectedRow - visibleRows + 1;
  offset = Math.min(
    Math.max(0, offset),
    Math.max(0, rows.length - visibleRows),
  );
  const window = rows.slice(offset, offset + visibleRows);

  useEffect(() => {
    return () => {
      if (previewTimer.current) clearTimeout(previewTimer.current);
    };
  }, []);

  // Reset the highlighted row when switching tabs (the group list changes).
  useEffect(() => {
    setSelected(0);
  }, [tabs?.active]);

  // Reset the highlighted row whenever the filter changes the visible list.
  // (Declared before the stepthrough-highlight effect so mount order is right.)
  useEffect(() => {
    setSelected(0);
  }, [filter]);

  // In stepthrough, scroll to (and select) the step's highlighted parameter so
  // it is never hidden past the current scroll window.
  const highlightKey =
    highlight?.map((h) => `${h.group ?? ""}:${h.label ?? ""}`).join("|") ?? "";
  useEffect(() => {
    if (!highlight || highlight.length === 0) return;
    const index = flat.findIndex(({ groupIndex, param }) => {
      const groupTitle = shownGroups[groupIndex]?.title ?? "";
      return highlight.some(
        (h) =>
          (h.group === undefined || h.group === groupTitle) &&
          (h.label === undefined || h.label === param.label),
      );
    });
    if (index >= 0) setSelected(index);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlightKey, tabs?.active]);

  useEffect(() => {
    if (!onExplain) return;
    const current = flat[Math.max(0, Math.min(selected, flat.length - 1))];
    if (!current) {
      onExplain(DEFAULT_EXPLAINER);
      return;
    }
    onExplain(
      describeParam(
        shownGroups[current.groupIndex]?.title ?? "",
        current.param,
      ),
    );
    // `flat`/`groups` are rebuilt each render; selection/title are the real
    // triggers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, title, onExplain]);

  const schedulePreview = (param: EditorParam) => {
    if (!param.preview || !onPreview) return;
    if (previewTimer.current) clearTimeout(previewTimer.current);
    previewTimer.current = setTimeout(() => onPreview(), 350);
  };

  const isModified = (groupTitle: string, param: EditorParam): boolean => {
    const base = baseline.current.get(`${groupTitle}::${param.label}`);
    return base !== undefined && base !== param.value;
  };

  const resetCurrent = () => {
    const entry = flat[Math.max(0, Math.min(selected, flat.length - 1))];
    if (!entry) return;
    const base = baseline.current.get(
      `${shownGroups[entry.groupIndex]?.title ?? ""}::${entry.param.label}`,
    );
    if (base === undefined) return;
    entry.param.set(base);
    schedulePreview(entry.param);
  };

  const adjust = (param: EditorParam, direction: 1 | -1, large = false) => {
    if (param.kind === "toggle") {
      param.set(!(param.value as boolean));
    } else if (param.kind === "enum") {
      const choices = param.choices ?? [];
      const index = choices.indexOf(String(param.value));
      const next =
        (index + direction + choices.length) % Math.max(choices.length, 1);
      param.set(choices[next] ?? param.value);
    } else if (param.kind === "text") {
      return;
    } else {
      const step = (param.step ?? 1) * (large ? LARGE_STEP_FACTOR : 1);
      const raw = (param.value as number) + step * direction;
      const value = clamp(
        param.integer ? Math.round(raw) : raw,
        param.min,
        param.max,
      );
      param.set(param.integer ? Math.round(value) : value);
    }
    schedulePreview(param);
  };

  const commitEdit = () => {
    if (!current || editing === null) return;
    const parsed = parseEditText(current.param, editing);
    if (parsed !== null) {
      current.param.set(parsed);
      schedulePreview(current.param);
    }
    setEditing(null);
  };

  useInput(
    (char, key) => {
      // Filter entry swallows keys while the search box is focused.
      if (filterEditing) {
        if (key.escape || key.return) {
          setFilterEditing(false);
          return;
        }
        if (key.backspace || key.delete) {
          setFilter((value) => value.slice(0, -1));
          return;
        }
        if (key.ctrl || key.meta || key.tab) return;
        if (char && char !== "/") setFilter((value) => value + char);
        return;
      }
      // Enum chooser popup swallows keys until Enter/Escape.
      if (choosing) {
        if (key.escape || char === "x") {
          setChoosing(null);
          return;
        }
        if (key.return) {
          const option = choosing.options[choosing.index];
          if (option !== undefined && current) {
            current.param.set(option);
            schedulePreview(current.param);
          }
          setChoosing(null);
          return;
        }
        if (key.upArrow || key.leftArrow) {
          setChoosing((state) =>
            state ? { ...state, index: Math.max(0, state.index - 1) } : state,
          );
          return;
        }
        if (key.downArrow || key.rightArrow) {
          setChoosing((state) =>
            state
              ? {
                  ...state,
                  index: Math.min(state.options.length - 1, state.index + 1),
                }
              : state,
          );
          return;
        }
        const digit = Number(char);
        if (
          char &&
          Number.isInteger(digit) &&
          digit >= 1 &&
          digit <= choosing.options.length
        ) {
          setChoosing((state) =>
            state ? { ...state, index: digit - 1 } : state,
          );
        }
        return;
      }
      // Inline value entry swallows every key until Enter/Escape.
      if (editing !== null) {
        if (key.escape || char === "x") {
          setEditing(null);
          return;
        }
        if (key.return) {
          commitEdit();
          return;
        }
        if (key.backspace || key.delete) {
          setEditing((text) => (text ?? "").slice(0, -1));
          return;
        }
        if (
          key.ctrl ||
          key.meta ||
          key.tab ||
          key.upArrow ||
          key.downArrow ||
          key.leftArrow ||
          key.rightArrow
        ) {
          return;
        }
        if (char) setEditing((text) => (text ?? "") + char);
        return;
      }

      if (submit && char === submit.key) {
        submit.run();
        return;
      }

      if (key.escape || char === "x") {
        if (filter) {
          setFilter("");
          return;
        }
        onClose();
        return;
      }
      if (char === "/") {
        setFilterEditing(true);
        return;
      }
      if (char === "r") {
        resetCurrent();
        return;
      }
      if (tabs) {
        if (key.tab) {
          const step = key.shift ? -1 : 1;
          const next =
            (tabs.active + step + tabs.labels.length) % tabs.labels.length;
          tabs.onSelect(next);
          return;
        }
        if (char === "[" || char === "]") {
          const step = char === "[" ? -1 : 1;
          const next =
            (tabs.active + step + tabs.labels.length) % tabs.labels.length;
          tabs.onSelect(next);
          return;
        }
        const tabIndex = Number(char);
        if (
          Number.isInteger(tabIndex) &&
          tabIndex >= 1 &&
          tabIndex <= tabs.labels.length &&
          char
        ) {
          tabs.onSelect(tabIndex - 1);
          return;
        }
      }
      if (char === "," && onPrev) {
        onPrev();
        return;
      }
      if (char === "." && onNext) {
        onNext();
        return;
      }
      if (!tabs && char === "[" && onPrev) {
        onPrev();
        return;
      }
      if (!tabs && char === "]" && onNext) {
        onNext();
        return;
      }
      if (key.upArrow) {
        if (key.ctrl) {
          const group = current?.groupIndex ?? 0;
          const target = Math.max(group - 1, 0);
          setSelected(groupFirstFlat[target] ?? 0);
          return;
        }
        setSelected((index) => Math.max(0, index - 1));
        return;
      }
      if (key.downArrow) {
        if (key.ctrl) {
          const group = current?.groupIndex ?? 0;
          const target = Math.min(group + 1, shownGroups.length - 1);
          setSelected(groupFirstFlat[target] ?? Math.max(0, flat.length - 1));
          return;
        }
        setSelected((index) =>
          flat.length === 0
            ? 0
            : Math.max(0, Math.min(flat.length - 1, index + 1)),
        );
        return;
      }
      if (key.leftArrow || key.rightArrow) {
        if (current) adjust(current.param, key.leftArrow ? -1 : 1, key.ctrl);
        return;
      }
      if (key.return || char === "z") {
        if (current) {
          if (current.param.kind === "enum") {
            const options = current.param.choices ?? [];
            const index = Math.max(
              0,
              options.indexOf(String(current.param.value)),
            );
            setChoosing({ options, index });
          } else {
            setEditing(initialEditText(current.param));
          }
        }
        return;
      }
      if (char === "p") {
        if (onPreview) onPreview();
      }
    },
    { isActive: active },
  );

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="green"
      paddingX={1}
      flexGrow={1}
    >
      <Text bold color="green">
        {title}
      </Text>
      {tabs ? (
        <Text>
          {tabs.labels.map((label, tabIndex) => {
            const isActive = tabIndex === tabs.active;
            const isOn = tabs.highlight?.[tabIndex] ?? false;
            return (
              <Text
                key={label}
                bold={isOn}
                inverse={isActive}
                color={isOn ? "green" : isActive ? "black" : "gray"}
              >
                {` ${label} `}
              </Text>
            );
          })}
        </Text>
      ) : null}
      <Text dimColor wrap="truncate-end">
        {editing !== null
          ? `type ${current?.param.label ?? "value"}: ${editing}▏ · enter apply · esc cancel`
          : (hint ??
              "↑↓ select · ctrl+↑↓ cat · ←→ adj · ctrl+←→ big · enter type · p preview · esc") +
            (submit ? ` · ${submit.label}: ${submit.key}` : "")}
        {editing === null && rows.length > visibleRows
          ? ` · ${offset + 1}-${Math.min(offset + visibleRows, rows.length)}`
          : ""}
      </Text>
      {filterEditing || filter ? (
        <Text color={filterEditing ? "cyan" : "gray"} wrap="truncate-end">
          {"filter: "}
          {filter}
          {filterEditing ? "▏" : ""}
          {filterEditing
            ? " · type · enter/esc done"
            : ` · ${flat.length} params · / edit · esc clear`}
        </Text>
      ) : null}
      {choosing ? (
        <Box
          flexDirection="column"
          borderStyle="round"
          borderColor="cyan"
          paddingX={1}
        >
          <Text dimColor>
            choose {current?.param.label ?? "value"} · ↑↓ move · enter select ·
            esc cancel
          </Text>
          {choosing.options.map((option, index) => (
            <Text
              key={option}
              inverse={index === choosing.index}
              color={index === choosing.index ? undefined : "gray"}
            >
              {index === choosing.index ? "▶ " : "  "}
              {option}
            </Text>
          ))}
        </Box>
      ) : (
        window.map((row, index) => {
          const key = `${offset}-${index}`;
          if (row.kind === "blank") return <Text key={key}> </Text>;
          if (row.kind === "header") {
            return (
              <Text
                key={key}
                bold
                color={row.groupIndex === selectedGroup ? "cyan" : "gray"}
              >
                {row.text}
              </Text>
            );
          }
          if (row.kind === "graph") {
            return <Box key={key}>{row.node}</Box>;
          }
          const isSelected = row.flat === selected;
          const groupTitle = shownGroups[row.groupIndex]?.title ?? "";
          const isHighlighted =
            highlight?.some(
              (h) =>
                (h.group === undefined || h.group === groupTitle) &&
                (h.label === undefined || h.label === row.param.label),
            ) ?? false;
          const modified = isModified(groupTitle, row.param);
          const ratio = proportion(row.param);
          return (
            <Box key={key}>
              <Text
                color={isHighlighted ? "yellow" : undefined}
                inverse={isSelected}
                bold={isHighlighted}
              >
                {(
                  (isHighlighted ? "◆ " : modified ? "• " : "  ") +
                  row.param.label
                ).padEnd(22)}
              </Text>
              <Text
                color={
                  isHighlighted ? "yellow" : isSelected ? undefined : "green"
                }
                inverse={isSelected}
              >
                {ratio !== null
                  ? `${"█".repeat(Math.round(ratio * 12))}${"░".repeat(
                      Math.max(0, 12 - Math.round(ratio * 12)),
                    )} `
                  : ""}
                {isSelected && editing !== null
                  ? `${editing}▏`
                  : displayValue(row.param)}
              </Text>
            </Box>
          );
        })
      )}
    </Box>
  );
}
