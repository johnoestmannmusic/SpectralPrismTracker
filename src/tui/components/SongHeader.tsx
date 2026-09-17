import { Box, Text } from "ink";
import type { Cursor, SessionState } from "../session";
import { formatClock } from "../format";

interface Props {
  state: SessionState;
  playhead: { order: number; row: number } | null;
}

export function SongHeader({ state, playhead }: Props) {
  const { song, mode, playing, time, duration, viewOrder } = state;
  if (!song) {
    return (
      <Box flexDirection="column">
        <Text bold color="yellow">
          Lantern
        </Text>
        <Text dimColor>{state.status || "Loading…"}</Text>
      </Box>
    );
  }

  const transport = playing ? "▶ PLAY" : "■ STOP";
  const position = `${formatClock(time)} / ${formatClock(duration)}`;
  const row = playhead?.row ?? state.cursor.row;

  return (
    <Box flexDirection="column">
      <Box>
        <Text bold color="green">
          ♪{" "}
        </Text>
        <Text bold>{song.meta.name}</Text>
        <Text dimColor> — {song.meta.author}</Text>
        <Text> </Text>
        <Text color={playing ? "green" : "gray"}>{transport}</Text>
        <Text dimColor> {position}</Text>
        <Text dimColor> [{mode}]</Text>
        {state.dirty ? <Text color="yellow"> ●</Text> : null}
      </Box>
      <Box>
        <Text dimColor>
          {song.meta.system} · {song.meta.tickRate.toFixed(1)}Hz ·{" "}
          {song.meta.patternLength} rows · order {viewOrder}/
          {Math.max(song.meta.orderLength - 1, 0)} · row {row} ·{" "}
          {song.instruments.length} ins
        </Text>
      </Box>
      <OrderStrip state={state} playhead={playhead} />
    </Box>
  );
}

function OrderStrip({ state, playhead }: Props) {
  const { song, viewOrder } = state;
  if (!song) return null;
  const total = song.meta.orderLength;
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
