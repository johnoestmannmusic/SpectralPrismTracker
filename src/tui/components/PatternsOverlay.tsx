import { Box, Text, useInput } from "ink";
import { useEffect, useState } from "react";
import { useSession } from "../hooks";
import type { ExplainerText } from "../explainer";
import type { Session, SessionState } from "../session";

interface Props {
  session: Session;
  active: boolean;
  onClose: () => void;
  onExplain?: (content: ExplainerText) => void;
  /** Height available to the overlay (for list scrolling). */
  height?: number;
  /** Preview state supplied by stepthrough (defaults to the live session). */
  state?: SessionState;
  /** Stepthrough order to mark. */
  highlightOrder?: number;
}

/**
 * Pattern Manager: add, duplicate, remove and re-arrange order positions, and
 * re-point an order at a specific pattern number (parity with the original).
 */
export function PatternsOverlay({
  session,
  active,
  onClose,
  onExplain,
  height,
  state: stateOverride,
  highlightOrder,
}: Props) {
  const live = useSession(session);
  const state = stateOverride ?? live;
  const [selected, setSelected] = useState(state.viewOrder);
  const [editing, setEditing] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  const song = state.song;
  const orderLength = song?.meta.orderLength ?? 0;
  const channel0 = song?.channels[0];
  const patternAt = (pos: number): number => channel0?.orderList[pos] ?? 0;

  // Keep the selection in range as orders are added/removed.
  const clamped = Math.min(Math.max(selected, 0), Math.max(orderLength - 1, 0));

  useEffect(() => {
    if (!onExplain || !song || orderLength === 0) return;
    const pattern = patternAt(clamped);
    onExplain({
      title: `Order ${String(clamped).padStart(2, "0")} · pattern ${pattern}`,
      body: `Position ${clamped} of ${orderLength} in the song arrangement.\n\nShift+↑/↓ or J/K re-arranges this order. a adds an empty order, d duplicates, x removes, e re-points the pattern number. Enter jumps the tracker here.`,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clamped, orderLength, onExplain, song?.meta.name]);

  useInput(
    (char, key) => {
      if (editing !== null) {
        if (key.escape) {
          setEditing(null);
          return;
        }
        if (key.return) {
          const value = Number(editing.trim());
          if (Number.isFinite(value))
            session.setOrderPatternNumber(clamped, value);
          setEditing(null);
          return;
        }
        if (key.backspace || key.delete) {
          setEditing((text) => (text ?? "").slice(0, -1));
          return;
        }
        if (key.ctrl || key.meta || key.tab) return;
        if (char) setEditing((text) => (text ?? "") + char);
        return;
      }

      if (key.escape || char === "q") {
        onClose();
        return;
      }
      if (confirmClear && char !== "c") setConfirmClear(false);
      if (key.upArrow) {
        if (key.shift) {
          if (session.moveOrder(clamped, -1))
            setSelected(Math.max(clamped - 1, 0));
          return;
        }
        setSelected((value) => Math.max(0, value - 1));
        return;
      }
      if (key.downArrow) {
        if (key.shift) {
          if (session.moveOrder(clamped, 1))
            setSelected(Math.min(clamped + 1, orderLength - 1));
          return;
        }
        setSelected((value) =>
          orderLength === 0
            ? 0
            : Math.max(0, Math.min(orderLength - 1, value + 1)),
        );
        return;
      }
      if (char === "K") {
        if (session.moveOrder(clamped, -1))
          setSelected(Math.max(clamped - 1, 0));
        return;
      }
      if (char === "J") {
        if (session.moveOrder(clamped, 1))
          setSelected(Math.min(clamped + 1, orderLength - 1));
        return;
      }
      if (char === "a") {
        if (session.insertPatternAt(clamped, false))
          setSelected(Math.min(clamped + 1, orderLength));
        return;
      }
      if (char === "d") {
        if (session.insertPatternAt(clamped, true))
          setSelected(Math.min(clamped + 1, orderLength));
        return;
      }
      if (char === "x" || key.delete) {
        if (session.removePatternAt(clamped))
          setSelected(Math.max(clamped - 1, 0));
        return;
      }
      if (char === "e") {
        setEditing(String(patternAt(clamped)));
        return;
      }
      if (char === "c") {
        if (confirmClear) {
          session.clearAllPatterns();
          setConfirmClear(false);
        } else {
          setConfirmClear(true);
        }
        return;
      }
      if (key.return) {
        session.setViewOrder(clamped);
        onClose();
      }
    },
    { isActive: active },
  );

  const visible = Math.max(3, (height ?? 24) - 5);
  let start = 0;
  if (clamped >= visible) start = clamped - visible + 1;
  start = Math.min(start, Math.max(0, orderLength - visible));
  const orders = Array.from(
    { length: Math.max(Math.min(orderLength - start, visible), 0) },
    (_, i) => start + i,
  );

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="green"
      paddingX={1}
    >
      <Text bold color="green">
        Pattern Manager
      </Text>
      {editing !== null ? (
        <Text dimColor>
          pattern number: {editing}▏ · enter apply · esc cancel
        </Text>
      ) : confirmClear ? (
        <Text color="yellow">
          press c again to clear every pattern · any other key cancels
        </Text>
      ) : (
        <Text dimColor wrap="truncate-end">
          ↑↓ select · shift+↑↓/J/K move · a add · d duplicate · x remove · e
          number · enter jump · esc close
        </Text>
      )}
      <Box flexDirection="column">
        {orderLength === 0 ? (
          <Text dimColor>(no song)</Text>
        ) : (
          orders.map((pos) => {
            const cursor = pos === clamped;
            const isView = pos === state.viewOrder;
            const marked = pos === highlightOrder;
            return (
              <Box key={pos}>
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
                  {String(pos).padStart(2, "0")}
                </Text>
                <Text> PAT {String(patternAt(pos)).padStart(2, "0")}</Text>
                {isView ? <Text color="green"> ◀ view</Text> : null}
              </Box>
            );
          })
        )}
      </Box>
    </Box>
  );
}
