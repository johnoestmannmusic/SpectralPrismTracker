import { Box, Text } from "ink";
import type { PatternCell } from "@/core/songTypes";
import { cellAt } from "@/core/songModel";
import { flatColumnsForChannel, globalColumnIndex } from "@/core/tracker";
import {
  formatEffect,
  formatInstrument,
  formatNote,
  formatVolume,
} from "../format";
import type { SessionState } from "../session";

interface SelectionRect {
  order: number;
  rowLo: number;
  rowHi: number;
  colLo: number;
  colHi: number;
}

interface Props {
  state: SessionState;
  viewportRows: number;
  playhead: { order: number; row: number } | null;
  selection: SelectionRect | null;
  /** Stepthrough cells to mark (order/channel/row). */
  highlight?: Array<{ channel: number; order: number; row: number }>;
}

interface Segment {
  text: string;
  /** Index into the channel's flat column list, or -1 for separators. */
  column: number;
}

const CHANNEL_COLORS = ["cyan", "magenta", "yellow", "blue"] as const;

/**
 * Darkened truecolor tint for an instrument's `colorRgb`, approximating the
 * original app's translucent cell highlight. Ink/chalk accept `rgb(r,g,b)`
 * backgrounds, so the exact instrument hue is preserved.
 */
function instrumentTint(rgb: [number, number, number], strong = false): string {
  const factor = strong ? 0.55 : 0.3;
  const [r, g, b] = rgb;
  return `rgb(${Math.round(r * factor)}, ${Math.round(g * factor)}, ${Math.round(
    b * factor,
  )})`;
}

function segmentsFor(
  song: NonNullable<SessionState["song"]>,
  channel: number,
  cell: PatternCell,
): Segment[] {
  const columns = flatColumnsForChannel(song, channel);
  const segments: Segment[] = [];
  columns.forEach((column, columnIndex) => {
    if (columnIndex > 0) segments.push({ text: " ", column: -1 });
    switch (column.kind) {
      case "note":
        segments.push({ text: formatNote(cell), column: columnIndex });
        break;
      case "ins":
        segments.push({ text: formatInstrument(cell), column: columnIndex });
        break;
      case "vol":
        segments.push({ text: formatVolume(cell), column: columnIndex });
        break;
      case "fx":
        segments.push({
          text: formatEffect(cell, column.index),
          column: columnIndex,
        });
        break;
    }
  });
  return segments;
}

function channelWidth(
  song: NonNullable<SessionState["song"]>,
  channel: number,
): number {
  return flatColumnsForChannel(song, channel).reduce((sum, column, index) => {
    const width = column.kind === "fx" ? 4 : column.kind === "note" ? 3 : 2;
    return sum + width + (index > 0 ? 1 : 0);
  }, 0);
}

export function PatternView({
  state,
  viewportRows,
  playhead,
  selection,
  highlight,
}: Props) {
  const { song, cursor, viewOrder } = state;
  if (!song) {
    return (
      <Box>
        <Text dimColor>No song loaded.</Text>
      </Box>
    );
  }

  const patternLength = song.meta.patternLength;
  const rows = Math.max(Math.min(viewportRows, patternLength), 1);
  // While following, the viewport scrolls to the playhead row rather than the
  // edit cursor, so editing never drags the view off the playhead.
  const scrollRow =
    state.follow && playhead !== null && state.viewRow !== null
      ? state.viewRow
      : cursor.row;
  const startRow = Math.max(
    0,
    Math.min(
      scrollRow - Math.floor(rows / 2),
      Math.max(patternLength - rows, 0),
    ),
  );
  const endRow = Math.min(startRow + rows, patternLength);
  const channelCount = Math.min(song.channels.length, 4);
  const patternIndex = song.channels[cursor.channel]?.orderList[viewOrder] ?? 0;
  const widths = Array.from({ length: channelCount }, (_, channel) =>
    channelWidth(song, channel),
  );

  const header = (
    <Box flexDirection="row">
      <Text dimColor>{"    "}</Text>
      {Array.from({ length: channelCount }, (_, channel) => (
        <Text key={channel}>
          <Text bold color={CHANNEL_COLORS[channel % CHANNEL_COLORS.length]}>
            {`CH${channel + 1}`.padEnd(widths[channel]!)}
          </Text>
          {channel < channelCount - 1 ? <Text dimColor> │ </Text> : null}
        </Text>
      ))}
    </Box>
  );

  const beatA = Math.max(song.meta.highlightA || 4, 1);
  const beatB = Math.max(song.meta.highlightB || 16, 1);

  const body = Array.from({ length: endRow - startRow }, (_, offset) => {
    const row = startRow + offset;
    const isPlayheadRow = playhead?.order === viewOrder && playhead.row === row;
    const isCursorRow = cursor.row === row && cursor.order === viewOrder;
    const isBar = row % beatB === 0;
    const isBeat = !isBar && row % beatA === 0;
    const marker = isBar ? "●" : isBeat ? "·" : " ";
    const inSelectedRows =
      selection !== null &&
      selection.order === viewOrder &&
      row >= selection.rowLo &&
      row <= selection.rowHi;
    return (
      <Box key={row} flexDirection="row">
        <Text
          color={
            isPlayheadRow
              ? "green"
              : isBar
                ? "black"
                : isBeat
                  ? "cyan"
                  : undefined
          }
          backgroundColor={
            isPlayheadRow ? undefined : isBar ? "gray" : undefined
          }
          bold={isPlayheadRow || isBar}
          dimColor={!isPlayheadRow && !isBar && !isBeat}
        >
          {marker}
          {row.toString(16).toUpperCase().padStart(2, "0")}{" "}
        </Text>
        {Array.from({ length: channelCount }, (_, channel) => {
          const cell = cellAt(song, channel, viewOrder, row);
          const segments = segmentsFor(song, channel, cell);
          const selectedChannel = cursor.channel === channel && isCursorRow;
          const columns = flatColumnsForChannel(song, channel);
          // Colour by the instrument only while a note is held; a note-off
          // clears the tint even though the channel keeps the instrument.
          const heldNote =
            song.channels[channel]?.noteTimeline[viewOrder]?.[row] ?? null;
          const instrument = heldNote
            ? (song.channels[channel]?.insTimeline[viewOrder]?.[row] ?? null)
            : null;
          const info =
            instrument !== null ? song.instruments[instrument] : undefined;
          const tint =
            state.colorInstruments && info
              ? instrumentTint(info.colorRgb, isPlayheadRow)
              : undefined;
          const isHighlighted =
            highlight?.some(
              (h) =>
                h.channel === channel && h.order === viewOrder && h.row === row,
            ) ?? false;
          return (
            <Text key={channel}>
              {segments.map((segment, index) => {
                const isCursor =
                  selectedChannel && segment.column === cursor.column;
                const inSelection =
                  inSelectedRows &&
                  selection !== null &&
                  segment.column >= 0 &&
                  (() => {
                    const global = globalColumnIndex(
                      song,
                      channel,
                      columns[segment.column]!,
                    );
                    return (
                      global >= selection.colLo && global <= selection.colHi
                    );
                  })();
                const beatBackground = isBar && !isPlayheadRow;
                return (
                  <Text
                    key={index}
                    color={
                      isCursor || isHighlighted
                        ? "black"
                        : beatBackground
                          ? undefined
                          : segment.column === 0 && cell.note
                            ? CHANNEL_COLORS[channel % CHANNEL_COLORS.length]
                            : undefined
                    }
                    backgroundColor={
                      isCursor
                        ? "white"
                        : inSelection
                          ? "blue"
                          : isHighlighted
                            ? "yellow"
                            : (tint ?? (beatBackground ? "gray" : undefined))
                    }
                    inverse={
                      isPlayheadRow &&
                      !isCursor &&
                      !inSelection &&
                      !tint &&
                      !isHighlighted
                    }
                  >
                    {segment.text}
                  </Text>
                );
              })}
              {channel < channelCount - 1 ? <Text dimColor> │ </Text> : null}
            </Text>
          );
        })}
      </Box>
    );
  });

  return (
    <Box flexDirection="column" flexGrow={1}>
      <Box>
        <Text dimColor>Pattern </Text>
        <Text bold color="green">
          {String(patternIndex).padStart(2, "0")}
        </Text>
        <Text dimColor> · order {String(viewOrder).padStart(2, "0")}</Text>
        {playhead ? (
          <Text color="green">
            {"   "}▶ {String(playhead.order).padStart(2, "0")}:
            {String(playhead.row).padStart(2, "0")}
          </Text>
        ) : null}
      </Box>
      {header}
      {body}
    </Box>
  );
}
