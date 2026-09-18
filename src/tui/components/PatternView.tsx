import { Box, Text } from "ink";
import type { PatternCell } from "@/core/songTypes";
import { cellAt } from "@/core/songModel";
import {
  channelPatternAt,
  orderRowLength,
  patternRowLength,
} from "@/core/layout";
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
  /** Per-channel playhead positions (true polymeter); index = channel. */
  playheads?: Array<{ order: number; row: number }> | null;
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
  playheads,
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

  const patternLength = orderRowLength(song, viewOrder);
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

  // ---- Cycles Mode performance view --------------------------------------
  // Outside Cycles Mode the tracker behaves exactly as before. Inside it, each
  // channel gets its own row-number gutter and scrolls independently so its
  // own playhead sits on a fixed centre line.
  if (state.cyclesMode) {
    const visible = Math.max(viewportRows, 1);
    const centre = Math.floor(visible / 2);
    const fallback = Math.max(song.meta.patternLength, 1);
    const infos = Array.from({ length: channelCount }, (_, channel) => {
      const ph = playheads?.[channel];
      // Playing: centre on the channel's own playhead. Stopped: centre every
      // channel on the edit cursor row at the viewed order.
      const order = ph?.order ?? state.viewOrder;
      const row = ph?.row ?? cursor.row;
      const ch = song.channels[channel];
      const patternIndex = ch ? channelPatternAt(ch, order) : undefined;
      const pattern =
        patternIndex === undefined ? undefined : ch?.patterns.get(patternIndex);
      return { order, row, rows: patternRowLength(pattern, fallback) };
    });
    return (
      <Box flexDirection="column" flexGrow={1}>
        <Box>
          <Text dimColor>Cycles · centred playhead · </Text>
          <Text bold color="green">
            {channelCount} channels
          </Text>
        </Box>
        <Box flexDirection="row">
          {Array.from({ length: channelCount }, (_, channel) => (
            <Text key={channel}>
              <Text
                bold
                color={CHANNEL_COLORS[channel % CHANNEL_COLORS.length]}
              >
                {`CH${channel + 1}`.padEnd(4 + widths[channel]!)}
              </Text>
              {channel < channelCount - 1 ? <Text dimColor> │ </Text> : null}
            </Text>
          ))}
        </Box>
        {Array.from({ length: visible }, (_, offset) => {
          const isPlayhead = offset === centre;
          return (
            <Box key={offset} flexDirection="row">
              {Array.from({ length: channelCount }, (_, channel) => {
                const info = infos[channel]!;
                const row = info.row - centre + offset;
                const inRange = row >= 0 && row < info.rows;
                const isBar = inRange && row % beatB === 0;
                const isBeat = inRange && !isBar && row % beatA === 0;
                const marker = isBar ? "●" : isBeat ? "·" : " ";
                const cell = inRange
                  ? cellAt(song, channel, info.order, row)
                  : null;
                const columns = flatColumnsForChannel(song, channel);
                const heldNote = inRange
                  ? (song.channels[channel]?.noteTimeline[info.order]?.[row] ??
                    null)
                  : null;
                const heldInstrument = heldNote
                  ? (song.channels[channel]?.insTimeline[info.order]?.[row] ??
                    null)
                  : null;
                const heldInfo =
                  heldInstrument !== null
                    ? song.instruments[heldInstrument]
                    : undefined;
                const tint =
                  state.colorInstruments && heldInfo
                    ? instrumentTint(heldInfo.colorRgb, isPlayhead)
                    : undefined;
                const isCursorHere =
                  inRange &&
                  cursor.channel === channel &&
                  cursor.order === info.order &&
                  cursor.row === row;
                const inSelectedRows =
                  inRange &&
                  selection !== null &&
                  selection.order === info.order &&
                  row >= selection.rowLo &&
                  row <= selection.rowHi;
                const beatBackground = isBar && !isPlayhead;
                return (
                  <Text key={channel}>
                    <Text
                      color={
                        isPlayhead
                          ? "green"
                          : isBar
                            ? "black"
                            : isBeat
                              ? "cyan"
                              : undefined
                      }
                      backgroundColor={
                        isPlayhead ? undefined : isBar ? "gray" : undefined
                      }
                      bold={isPlayhead || isBar}
                      dimColor={!inRange || (!isPlayhead && !isBar && !isBeat)}
                    >
                      {inRange
                        ? `${marker}${row.toString(16).toUpperCase().padStart(2, "0")} `
                        : "    "}
                    </Text>
                    {cell ? (
                      segmentsFor(song, channel, cell).map((segment, i) => {
                        const isCursor =
                          isCursorHere && segment.column === cursor.column;
                        const inSelection =
                          inSelectedRows &&
                          segment.column >= 0 &&
                          (() => {
                            const global = globalColumnIndex(
                              song,
                              channel,
                              columns[segment.column]!,
                            );
                            return (
                              global >= selection!.colLo &&
                              global <= selection!.colHi
                            );
                          })();
                        return (
                          <Text
                            key={i}
                            color={
                              isCursor
                                ? "black"
                                : segment.column === 0 && cell.note
                                  ? CHANNEL_COLORS[
                                      channel % CHANNEL_COLORS.length
                                    ]
                                  : undefined
                            }
                            backgroundColor={
                              isCursor
                                ? "white"
                                : inSelection
                                  ? "blue"
                                  : (tint ??
                                    (beatBackground ? "gray" : undefined))
                            }
                            inverse={
                              isPlayhead && !isCursor && !inSelection && !tint
                            }
                          >
                            {segment.text}
                          </Text>
                        );
                      })
                    ) : (
                      // Pad blank rows to the channel's fixed width so the
                      // columns never shift as the channel scrolls.
                      <Text dimColor>{" ".repeat(widths[channel]!)}</Text>
                    )}
                    {channel < channelCount - 1 ? (
                      <Text dimColor> │ </Text>
                    ) : null}
                  </Text>
                );
              })}
            </Box>
          );
        })}
      </Box>
    );
  }

  const body = Array.from({ length: endRow - startRow }, (_, offset) => {
    const row = startRow + offset;
    const isGlobalPlayheadRow =
      playhead?.order === viewOrder && playhead.row === row;
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
            isGlobalPlayheadRow
              ? "green"
              : isBar
                ? "black"
                : isBeat
                  ? "cyan"
                  : undefined
          }
          backgroundColor={
            isGlobalPlayheadRow ? undefined : isBar ? "gray" : undefined
          }
          bold={isGlobalPlayheadRow || isBar}
          dimColor={!isGlobalPlayheadRow && !isBar && !isBeat}
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
          const channelPlayhead = playheads?.[channel] ?? playhead;
          const isPlayheadRow =
            channelPlayhead?.order === viewOrder && channelPlayhead.row === row;
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
