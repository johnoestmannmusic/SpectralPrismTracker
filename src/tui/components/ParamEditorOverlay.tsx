import { Box, Text, useInput } from "ink";
import { useEffect, useRef, useState, type ReactNode } from "react";

export interface EditorParam {
  label: string;
  kind: "number" | "toggle" | "enum";
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
  /** Rows available to the overlay (excludes app header/status/command bar). */
  height: number;
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
  return ((param.value as number) - param.min) / (param.max - param.min);
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
  height,
}: Props) {
  const flat = groups.flatMap((group, groupIndex) =>
    group.params.map((param) => ({ groupIndex, param })),
  );
  const rows: Row[] = [];
  let flatIndex = 0;
  groups.forEach((group, groupIndex) => {
    rows.push({ kind: "header", text: group.title, groupIndex });
    if (group.graph)
      rows.push({ kind: "graph", node: group.graph, groupIndex });
    for (const param of group.params) {
      rows.push({ kind: "param", param, flat: flatIndex++, groupIndex });
    }
    rows.push({ kind: "blank" });
  });

  const [selected, setSelected] = useState(0);
  const previewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const current = flat[Math.max(0, Math.min(selected, flat.length - 1))];
  const selectedGroup = current?.groupIndex ?? 0;

  // Scroll so the selected param stays on screen.
  const visibleRows = Math.max(4, height - 3);
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

  const schedulePreview = (param: EditorParam) => {
    if (!param.preview || !onPreview) return;
    if (previewTimer.current) clearTimeout(previewTimer.current);
    previewTimer.current = setTimeout(() => onPreview(), 350);
  };

  const adjust = (param: EditorParam, direction: 1 | -1) => {
    if (param.kind === "toggle") {
      param.set(!(param.value as boolean));
    } else if (param.kind === "enum") {
      const choices = param.choices ?? [];
      const index = choices.indexOf(String(param.value));
      const next =
        (index + direction + choices.length) % Math.max(choices.length, 1);
      param.set(choices[next] ?? param.value);
    } else {
      const step = param.step ?? 1;
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

  useInput(
    (char, key) => {
      if (key.escape) {
        onClose();
        return;
      }
      if (char === "[" && onPrev) {
        onPrev();
        return;
      }
      if (char === "]" && onNext) {
        onNext();
        return;
      }
      if (key.upArrow) {
        setSelected((index) => Math.max(0, index - 1));
        return;
      }
      if (key.downArrow) {
        setSelected((index) =>
          flat.length === 0
            ? 0
            : Math.max(0, Math.min(flat.length - 1, index + 1)),
        );
        return;
      }
      if (key.leftArrow || key.rightArrow) {
        if (current) adjust(current.param, key.leftArrow ? -1 : 1);
        return;
      }
      if (key.return || char === "p") {
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
      <Text dimColor>
        {hint ?? "↑↓ select · ←→ adjust · enter preview · esc close"}
        {rows.length > visibleRows
          ? ` · ${offset + 1}-${Math.min(offset + visibleRows, rows.length)}`
          : ""}
      </Text>
      {window.map((row, index) => {
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
        const ratio = proportion(row.param);
        return (
          <Box key={key}>
            <Text
              color={isSelected ? "black" : undefined}
              backgroundColor={isSelected ? "white" : undefined}
            >
              {` ${row.param.label}`.padEnd(22)}
            </Text>
            <Text color={isSelected ? "yellow" : "green"}>
              {ratio !== null
                ? `${"█".repeat(Math.round(ratio * 12))}${"░".repeat(12 - Math.round(ratio * 12))} `
                : ""}
              {displayValue(row.param)}
            </Text>
          </Box>
        );
      })}
    </Box>
  );
}
