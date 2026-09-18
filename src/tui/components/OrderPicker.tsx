import { Box, Text, useInput } from "ink";
import { useState } from "react";
import type { Session } from "../session";

interface Props {
  session: Session;
  active: boolean;
  onClose: () => void;
  /** Height available to the overlay (for list scrolling). */
  height?: number;
}

/**
 * Fast "go to order" picker. [ and ] cycle one order at a time; this jumps
 * anywhere. Type digits to target an order directly, arrows to browse.
 */
export function OrderPicker({ session, active, onClose, height }: Props) {
  const state = session.getState();
  const song = state.song;
  const orderLength = song?.meta.orderLength ?? 0;
  const channel0 = song?.channels[0];
  const [selected, setSelected] = useState(state.viewOrder);
  const [typed, setTyped] = useState("");

  const clamped = Math.min(Math.max(selected, 0), Math.max(orderLength - 1, 0));
  const target = typed.length > 0 ? Number(typed) : null;
  const jump = (order: number) => {
    const next = Math.min(Math.max(order, 0), Math.max(orderLength - 1, 0));
    session.seekTo(next, 0);
    session.setCursor({ order: next, row: 0 });
    onClose();
  };

  useInput(
    (char, key) => {
      if (key.escape) {
        onClose();
        return;
      }
      if (key.upArrow) {
        setTyped("");
        setSelected((value) => Math.max(0, value - 1));
        return;
      }
      if (key.downArrow) {
        setTyped("");
        setSelected((value) =>
          orderLength === 0
            ? 0
            : Math.max(0, Math.min(orderLength - 1, value + 1)),
        );
        return;
      }
      if (key.pageUp) {
        setTyped("");
        setSelected((value) => Math.max(0, value - 10));
        return;
      }
      if (key.pageDown) {
        setTyped("");
        setSelected((value) =>
          Math.max(0, Math.min(orderLength - 1, value + 10)),
        );
        return;
      }
      if (key.return) {
        jump(target !== null && Number.isFinite(target) ? target : clamped);
        return;
      }
      if (key.backspace || key.delete) {
        setTyped((value) => value.slice(0, -1));
        return;
      }
      if (/^[0-9]$/.test(char)) {
        setTyped((value) => (value + char).slice(0, 4));
      }
    },
    { isActive: active },
  );

  const visible = Math.max(3, (height ?? 24) - 4);
  let start = 0;
  if (clamped >= visible) start = clamped - visible + 1;
  start = Math.min(start, Math.max(0, orderLength - visible));
  const orders = Array.from(
    { length: Math.max(Math.min(orderLength - start, visible), 0) },
    (_, index) => start + index,
  );

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="cyan"
      paddingX={1}
      flexGrow={1}
    >
      <Text bold color="cyan">
        Go to order
      </Text>
      <Text dimColor wrap="truncate-end">
        ↑↓ select · type a number · enter jump · esc close
        {typed ? ` · target ${typed}` : ""}
      </Text>
      <Box flexDirection="column">
        {orderLength === 0 ? (
          <Text dimColor>(no song)</Text>
        ) : (
          orders.map((order) => {
            const cursor = order === clamped;
            const isView = order === state.viewOrder;
            const isTarget = target !== null && target === order;
            return (
              <Box key={order}>
                <Text
                  color={cursor ? "black" : isTarget ? "yellow" : undefined}
                  backgroundColor={cursor ? "white" : undefined}
                  bold={isTarget}
                >
                  {String(order).padStart(2, "0")}
                </Text>
                <Text>
                  {" "}
                  PAT {String(channel0?.orderList[order] ?? 0).padStart(2, "0")}
                </Text>
                {isView ? <Text color="green"> ◀ view</Text> : null}
              </Box>
            );
          })
        )}
      </Box>
    </Box>
  );
}
