import { Box, Text } from "ink";
import type { Cursor, SessionState } from "../session";
import { formatClock } from "../format";
import { songLoopOrders } from "@/core/timing";
import { orderRowLength } from "@/core/layout";
import { versionStamp } from "../version";

interface Props {
  state: SessionState;
  playhead: { order: number; row: number } | null;
  /** When a menu is open, replaces the tracker order strip with its context. */
  context?: { title: string; hint: string } | null;
}

export function SongHeader({ state, playhead, context }: Props) {
  const { song, playing, time, duration, viewOrder } = state;
  if (!song) {
    return (
      <Box flexDirection="column">
        <Text bold color="yellow">
          {versionStamp()}
        </Text>
        <Text dimColor>{state.status || "Loading…"}</Text>
      </Box>
    );
  }

  const transport = playing ? "▶ PLAY" : "■ STOP";
  const position = `${formatClock(time)} / ${formatClock(duration)}`;
  const row = playhead?.row ?? state.cursor.row;
  const loopOrders = songLoopOrders(song);
  const rowsInView = orderRowLength(song, viewOrder);
  const channelLengths = song.channels.map((channel, index) => {
    const length = channel.orderLength || channel.orderList.length;
    // A channel has wrapped when the viewed order is past its own length.
    const wrapped = length > 0 && viewOrder >= length;
    return `${index + 1}:${length}${wrapped ? "↻" : ""}`;
  });

  return (
    <Box flexDirection="column">
      <Box>
        <Text bold color="green">
          {versionStamp()}
        </Text>
        <Text> </Text>
        <Text bold color="green">
          ♪{" "}
        </Text>
        <Text bold>{song.meta.name}</Text>
        <Text dimColor> — {song.meta.author}</Text>
        <Text> </Text>
        <Text color={playing ? "green" : "gray"}>{transport}</Text>
        <Text dimColor> {position}</Text>
        {state.dirty ? <Text color="yellow"> ●</Text> : null}
      </Box>
      <Box>
        <Text dimColor>
          {Number(song.meta.bpm.toFixed(2))} BPM · beat {song.meta.highlightA}
          /bar {song.meta.highlightB} · {rowsInView} rows · order {viewOrder}/
          {Math.max(loopOrders - 1, 0)} · loop {loopOrders} · row {row} · ch{" "}
          {channelLengths.join(" ")} · {song.instruments.length} ins
          {state.loopMode === "order" ? ` · LOOP order ${viewOrder}` : ""}
          {state.cyclesMode ? " · CYCLES" : ""}
        </Text>
      </Box>
      <OrderStrip state={state} playhead={playhead} context={context} />
    </Box>
  );
}

function OrderStrip({ state, playhead, context }: Props) {
  const { song, viewOrder } = state;
  if (!song) return null;
  if (context) {
    return (
      <Box>
        <Text bold color="green">
          {context.title}
        </Text>
        <Text dimColor> · {context.hint}</Text>
      </Box>
    );
  }
  const total = songLoopOrders(song);
  // Show a window of orders around the viewed one.
  const window = 16;
  const start = Math.max(
    0,
    Math.min(viewOrder - Math.floor(window / 2), Math.max(total - window, 0)),
  );
  const end = Math.min(total, start + window);
  const items = [];
  for (let order = start; order < end; order++) {
    const active = order === viewOrder;
    const isPlayhead = playhead?.order === order;
    items.push(
      <Text
        key={order}
        inverse={active}
        color={isPlayhead ? "green" : active ? "black" : undefined}
        dimColor={!active && !isPlayhead}
      >
        {String(order).padStart(2, "0")}
      </Text>,
    );
    items.push(<Text key={`${order}-gap`}> </Text>);
  }
  return (
    <Box>
      <Text dimColor>order </Text>
      {items}
      {end < total ? <Text dimColor>…</Text> : null}
      <Text dimColor> [ / ] cycle orders</Text>
    </Box>
  );
}

export type { Cursor };
