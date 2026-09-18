import { Box, Text, useInput } from "ink";
import { useEffect, useState } from "react";
import { useSession } from "../hooks";
import { songLoopOrders } from "@/core/timing";
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
  stepthroughOrder?: number;
  /** @deprecated use `stepthroughOrder`. */
  highlightOrder?: number;
}

/**
 * Pattern Manager: per-channel order editing. Each channel has its own order
 * list and length (Cycles Mode); ←/→ picks the channel, ↑/↓ selects an order,
 * and add/duplicate/remove/move/re-point act on that channel only.
 */
export function PatternsOverlay({
  session,
  active,
  onClose,
  onExplain,
  height,
  state: stateOverride,
  stepthroughOrder,
  highlightOrder,
}: Props) {
  const live = useSession(session);
  const state = stateOverride ?? live;
  const song = state.song;
  const channelCount = song?.channels.length ?? 0;
  const [channel, setChannel] = useState(0);
  const [selected, setSelected] = useState(state.viewOrder);
  const [editing, setEditing] = useState<string | null>(null);
  const [editingMode, setEditingMode] = useState<
    "length" | "pattern" | "rows" | "name"
  >("pattern");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsField, setSettingsField] = useState(0);
  const [confirmClear, setConfirmClear] = useState(false);

  const marked = stepthroughOrder ?? highlightOrder;
  const selectedChannel = song?.channels[channel];
  const listLength = selectedChannel
    ? selectedChannel.orderLength || selectedChannel.orderList.length
    : 0;
  const loopOrders = song ? songLoopOrders(song) : 0;
  const patternAt = (pos: number): number =>
    selectedChannel?.orderList[pos] ?? 0;
  const lengths = song
    ? song.channels.map((c) => c.orderLength || c.orderList.length)
    : [];

  // Keep the selection in range as orders are added/removed or channel changes.
  const clamped = Math.min(Math.max(selected, 0), Math.max(listLength - 1, 0));
  const slotInfo =
    song && selectedChannel ? session.patternSlotInfo(channel, clamped) : null;

  useEffect(() => {
    if (!onExplain || !song || channelCount === 0) return;
    const pattern = patternAt(clamped);
    onExplain({
      title: `Ch ${channel + 1} · order ${String(clamped).padStart(2, "0")} · pattern ${pattern}`,
      body: `Channel ${channel + 1} of ${channelCount}, position ${clamped} of ${listLength}. Channels loop independently — lengths ${lengths.join("/")} repeat every ${loopOrders} orders (LCM).

←/→ pick channel. ↑/↓ select. Shift+↑/↓ or J/K move this channel's order. a add, d duplicate, x/del remove, L set exact length, e pattern number. Enter opens the pattern settings (name / rows / number); z jumps the tracker here. c clears all.`,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel, clamped, listLength, loopOrders, onExplain, song?.meta.name]);

  useInput(
    (char, key) => {
      if (key.ctrl && char === "z") {
        session.undo();
        return;
      }
      if (key.ctrl && char === "y") {
        session.redo();
        return;
      }
      if (editing !== null) {
        if (key.escape || char === "x") {
          setEditing(null);
          return;
        }
        if (key.return) {
          const text = editing.trim();
          if (editingMode === "name") {
            session.setPatternName(channel, clamped, text);
          } else {
            const value = Number(text);
            if (Number.isFinite(value)) {
              if (editingMode === "length")
                session.setChannelOrderLength(channel, value);
              else if (editingMode === "rows")
                session.setPatternRowLength(channel, clamped, value);
              else
                session.setChannelOrderPatternNumber(channel, clamped, value);
            }
          }
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

      if (settingsOpen) {
        const info = session.patternSlotInfo(channel, clamped);
        if (!info) {
          setSettingsOpen(false);
          return;
        }
        if (key.escape || char === "q") {
          setSettingsOpen(false);
          return;
        }
        if (key.upArrow) {
          setSettingsField((value) => Math.max(0, value - 1));
          return;
        }
        if (key.downArrow) {
          setSettingsField((value) => Math.min(2, value + 1));
          return;
        }
        if (key.leftArrow || key.rightArrow) {
          const step = key.shift ? 8 : 1;
          const direction = key.rightArrow ? 1 : -1;
          if (settingsField === 1)
            session.setPatternRowLength(
              channel,
              clamped,
              info.rowLength + direction * step,
            );
          else if (settingsField === 2)
            session.setChannelOrderPatternNumber(
              channel,
              clamped,
              Math.max(0, info.index + direction * step),
            );
          return;
        }
        if (key.return) {
          if (settingsField === 0) {
            setEditing(info.name);
            setEditingMode("name");
          } else if (settingsField === 1) {
            setEditing(String(info.rowLength));
            setEditingMode("rows");
          } else {
            setEditing(String(info.index));
            setEditingMode("pattern");
          }
          return;
        }
        return;
      }

      if (key.escape || char === "q" || char === "x") {
        onClose();
        return;
      }
      if (confirmClear && char !== "c") setConfirmClear(false);

      if (key.leftArrow) {
        setChannel((value) => Math.max(0, value - 1));
        setSelected(0);
        return;
      }
      if (key.rightArrow) {
        setChannel((value) =>
          Math.min(Math.max(channelCount - 1, 0), value + 1),
        );
        setSelected(0);
        return;
      }
      if (key.upArrow) {
        if (key.shift) {
          if (session.moveChannelOrder(channel, clamped, -1))
            setSelected(Math.max(clamped - 1, 0));
          return;
        }
        setSelected((value) => Math.max(0, value - 1));
        return;
      }
      if (key.downArrow) {
        if (key.shift) {
          if (session.moveChannelOrder(channel, clamped, 1))
            setSelected(Math.min(clamped + 1, listLength - 1));
          return;
        }
        setSelected((value) =>
          listLength === 0
            ? 0
            : Math.max(0, Math.min(listLength - 1, value + 1)),
        );
        return;
      }
      if (char === "K") {
        if (session.moveChannelOrder(channel, clamped, -1))
          setSelected(Math.max(clamped - 1, 0));
        return;
      }
      if (char === "J") {
        if (session.moveChannelOrder(channel, clamped, 1))
          setSelected(Math.min(clamped + 1, listLength - 1));
        return;
      }
      if (char === "a") {
        if (session.insertChannelOrder(channel, clamped, false))
          setSelected(Math.min(clamped + 1, listLength));
        return;
      }
      if (char === "d") {
        if (session.insertChannelOrder(channel, clamped, true))
          setSelected(Math.min(clamped + 1, listLength));
        return;
      }
      if (key.delete || char === "r") {
        if (session.removeChannelOrder(channel, clamped))
          setSelected(Math.max(clamped - 1, 0));
        return;
      }
      if (char === "L") {
        setEditing(String(listLength));
        setEditingMode("length");
        return;
      }
      if (char === "e") {
        setEditing(String(patternAt(clamped)));
        setEditingMode("pattern");
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
        setSettingsOpen(true);
        setSettingsField(0);
        return;
      }
      if (char === "z") {
        session.setViewOrder(clamped);
        onClose();
      }
    },
    { isActive: active },
  );

  const visible = Math.max(3, (height ?? 24) - 7);
  let start = 0;
  if (clamped >= visible) start = clamped - visible + 1;
  start = Math.min(start, Math.max(0, listLength - visible));
  const orders = Array.from(
    { length: Math.max(Math.min(listLength - start, visible), 0) },
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
      <Box>
        <Text dimColor>channels </Text>
        {song?.channels.map((c, index) => {
          const length = c.orderLength || c.orderList.length;
          const isActive = index === channel;
          return (
            <Text
              key={index}
              bold={isActive}
              color={isActive ? "black" : undefined}
              backgroundColor={isActive ? "green" : undefined}
            >
              {" "}
              {index + 1}:{length}
              {index < channelCount - 1 ? " " : ""}
            </Text>
          );
        })}
        <Text dimColor> · loop {loopOrders} (LCM)</Text>
      </Box>
      {editing !== null ? (
        <Text dimColor>
          {editingMode === "name"
            ? "name"
            : editingMode === "rows"
              ? "rows"
              : editingMode === "length"
                ? "order length"
                : "pattern number"}
          : {editing}▏ · enter apply · esc cancel
        </Text>
      ) : confirmClear ? (
        <Text color="yellow">
          press c again to clear every pattern · any other key cancels
        </Text>
      ) : settingsOpen ? (
        <Text dimColor wrap="truncate-end">
          pattern settings · ↑↓ field · ←→ adjust · shift+←→ ×8 · enter edit ·
          esc back
        </Text>
      ) : (
        <Text dimColor wrap="truncate-end">
          ←→ channel · ↑↓ select · shift+↑↓/J/K move · a add · d duplicate ·
          del/r remove · L length · e number · enter settings · z jump · esc
          close
        </Text>
      )}
      <Box flexDirection="column">
        {settingsOpen && slotInfo ? (
          <>
            <Text>
              {settingsField === 0 ? "▶ " : "  "}Name:{" "}
              {slotInfo.name || "(unnamed)"}
            </Text>
            <Text>
              {settingsField === 1 ? "▶ " : "  "}Rows: {slotInfo.rowLength}
            </Text>
            <Text>
              {settingsField === 2 ? "▶ " : "  "}Pattern: {slotInfo.index}
            </Text>
          </>
        ) : listLength === 0 ? (
          <Text dimColor>(no song)</Text>
        ) : (
          orders.map((pos) => {
            const cursor = pos === clamped;
            const isView = pos === state.viewOrder;
            const isMarked = pos === marked;
            return (
              <Box key={pos}>
                <Text
                  color={isMarked && !cursor ? "yellow" : undefined}
                  bold={isMarked}
                >
                  {isMarked ? "◆" : " "}
                </Text>
                <Text
                  color={cursor ? "black" : isMarked ? "yellow" : undefined}
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
