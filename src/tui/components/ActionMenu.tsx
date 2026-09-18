import { Box, Text, useInput } from "ink";
import { useEffect, useMemo, useState } from "react";
import type { ContextAction } from "../contextActions";

interface Props {
  title: string;
  actions: ContextAction[];
  active: boolean;
  onClose: () => void;
  onRun: (action: ContextAction) => void;
  /** Rows available for the list (menu chrome is subtracted). */
  height?: number;
}

/**
 * Reusable keyboard action popup. This is the terminal-idiomatic answer to a
 * radial menu: a compact list of the actions relevant to whatever the user is
 * pointing at. Enter runs the highlighted action, digits jump, Esc closes.
 * Display + selection only — the host decides what an action does.
 */
export function ActionMenu({
  title,
  actions,
  active,
  onClose,
  onRun,
  height,
}: Props) {
  const enabled = useMemo(
    () => actions.map((action, index) => ({ action, index })),
    [actions],
  );
  const firstEnabled = enabled.find((entry) => entry.action.enabled !== false);
  const [selected, setSelected] = useState(firstEnabled?.index ?? 0);

  // Keep the selection on an enabled row whenever the action list changes.
  useEffect(() => {
    const current = actions[selected];
    if (!current || current.enabled === false) {
      const next = actions.findIndex((action) => action.enabled !== false);
      setSelected(next >= 0 ? next : 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actions]);

  const visible = Math.max(3, (height ?? actions.length + 4) - 4);
  let start = 0;
  if (selected >= visible) start = selected - visible + 1;
  start = Math.min(start, Math.max(0, actions.length - visible));
  const window = actions.slice(start, start + visible);

  const move = (direction: 1 | -1) => {
    if (actions.length === 0) return;
    let index = selected;
    for (let step = 0; step < actions.length; step++) {
      index = (index + direction + actions.length) % actions.length;
      if (actions[index]?.enabled !== false) break;
    }
    setSelected(index);
  };

  useInput(
    (char, key) => {
      if (key.escape || key.ctrl) {
        onClose();
        return;
      }
      if (key.upArrow || char === "k") {
        move(-1);
        return;
      }
      if (key.downArrow || char === "j") {
        move(1);
        return;
      }
      if (key.return) {
        const action = actions[selected];
        if (action && action.enabled !== false) onRun(action);
        return;
      }
      const digit = Number(char);
      if (Number.isInteger(digit) && digit >= 1 && digit <= 9) {
        const action = actions[digit - 1];
        if (action && action.enabled !== false) onRun(action);
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
      flexGrow={1}
    >
      <Text bold color="yellow">
        {title}
      </Text>
      <Text dimColor wrap="truncate-end">
        ↑↓/jk select · enter run · esc close
        {actions.length > visible
          ? ` · ${start + 1}-${Math.min(start + visible, actions.length)}/${actions.length}`
          : ""}
      </Text>
      <Box flexDirection="column">
        {window.length === 0 ? (
          <Text dimColor>(no actions available here)</Text>
        ) : (
          window.map((action, offset) => {
            const index = start + offset;
            const cursor = index === selected;
            const isEnabled = action.enabled !== false;
            const keys = action.keys?.length
              ? ` (${action.keys.join(" ")})`
              : "";
            return (
              <Box key={action.id}>
                <Text
                  color={cursor ? "black" : isEnabled ? undefined : "gray"}
                  backgroundColor={cursor ? "white" : undefined}
                  dimColor={!isEnabled}
                >
                  {` ${String(index + 1).padStart(2, " ")} ${action.label}${keys}`}
                </Text>
                {action.hint ? <Text dimColor> {action.hint}</Text> : null}
              </Box>
            );
          })
        )}
      </Box>
    </Box>
  );
}
