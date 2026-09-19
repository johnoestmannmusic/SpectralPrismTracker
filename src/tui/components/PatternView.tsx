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

  const fallback = Math.max(song.meta.patternLength, 1);
  const patternLength = orderRowLength(song, viewOrder);
  const channelCount = Math.min(song.channels.length, 4);
  const budget = Math.max(viewportRows, 1);
  // While following, the viewport scrolls to the playhead row rather than the
  // edit cursor, so editing never drags the view off the playhead.
  const scrollRow =
    state.follow && playhead !== null && state.viewRow !== null
      ? state.viewRow
      : cursor.row;

  /** A pattern's row count by the channel's order-list index. */
  const channelOrderRows = (channel: number, orderIndex: number): number => {
    const ch = song.channels[channel];
    if (!ch) return 0;
    const patternIndex = ch.orderList[orderIndex];
    return patternRowLength(
      patternIndex === undefined ? undefined : ch.patterns.get(patternIndex),
      fallback,
    );
  };

  /**
   * Resolve a channel's cell at stream row `o` (relative to the current order).
   * Walks the channel's order list in both directions so ghost rows can span
   * several orders and always fill the window's top/bottom.
   */
  const channelStreamCell = (
    channel: number,
    o: number,
  ): { order: number; row: number; ghost: boolean } | null => {
    const ch = song.channels[channel];
    const len = ch ? ch.orderLength || ch.orderList.length : 0;
    if (!ch || len === 0) return null;
    const current = ((viewOrder % len) + len) % len;
    const currentLen = channelOrderRows(channel, current);
    if (o >= 0 && o < currentLen) {
      return { order: current, row: o, ghost: false };
    }
    let index = current;
    let row = o;
    if (row >= currentLen) {
      row -= currentLen;
      for (let step = 0; step < len + 1; step++) {
        index = (index + 1) % len;
        const rows = channelOrderRows(channel, index);
        if (row < rows) return { order: index, row, ghost: true };
        row -= rows;
      }
    } else {
      for (let step = 0; step < len + 1; step++) {
        index = (index - 1 + len) % len;
        row += channelOrderRows(channel, index);
        if (row >= 0) return { order: index, row, ghost: true };
      }
    }
    return null;
  };

  // The viewport is a windowed slice of a continuous stream that walks the
  // channel's orders in both directions, so ghost rows always fill the rows
  // above/below the window and scroll with playhead follow.
  const windowSize = budget;
  const centered = scrollRow - Math.floor(windowSize / 2);
  const windowStart = state.ghosting
    ? centered
    : Math.max(0, Math.min(centered, Math.max(patternLength - windowSize, 0)));
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

  /** A dim, read-only context row built from per-channel (order, row) cells. */
  const renderGhostRow = (
    key: string,
    cells: Array<{ order: number; row: number } | null>,
  ) => (
    <Box key={key} flexDirection="row">
      <Text color="gray">{"  ~ "}</Text>
      {cells.map((cell, channel) => {
        const text = cell
          ? segmentsFor(
              song,
              channel,
              cellAt(song, channel, cell.order, cell.row),
            )
              .map((segment) => segment.text)
              .join("")
          : "";
        return (
          <Text key={channel} color="gray">
            {text.padEnd(widths[channel]!)}
            {channel < channelCount - 1 ? " │ " : ""}
          </Text>
        );
      })}
    </Box>
  );

  // ---- Cycles Mode performance view --------------------------------------
  // Outside Cycles Mode the tracker behaves exactly as before. Inside it, each
  // channel gets its own row-number gutter and scrolls independently so its
  // own playhead sits on a fixed centre line.
  if (state.cyclesMode) {
    const visible = Math.max(viewportRows, 1);
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
    const centre = Math.floor(visible / 2);
    // Resolve a stream row for one channel: offsets beyond the current pattern
    // become ghost rows from the adjacent orders (so they scroll with the
    // channel). `null` means no row (e.g. beyond the adjacent pattern).
    const resolve = (
      channel: number,
      info: (typeof infos)[number],
      o: number,
    ): { order: number; row: number; ghost: boolean } | null => {
      const ch = song.channels[channel];
      const len = ch ? ch.orderLength || ch.orderList.length : 0;
      if (!ch || len === 0) return null;
      if (o >= 0 && o < info.rows) {
        return { order: info.order, row: o, ghost: false };
      }
      let index = info.order;
      let row = o;
      if (row >= info.rows) {
        row -= info.rows;
        for (let step = 0; step < len + 1; step++) {
          index = (index + 1) % len;
          const rows = channelOrderRows(channel, index);
          if (row < rows) return { order: index, row, ghost: true };
          row -= rows;
        }
      } else {
        for (let step = 0; step < len + 1; step++) {
          index = (index - 1 + len) % len;
          row += channelOrderRows(channel, index);
          if (row >= 0) return { order: index, row, ghost: true };
        }
      }
      return null;
    };
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
                const o = info.row - centre + offset;
                const resolved = state.ghosting
                  ? resolve(channel, info, o)
                  : o >= 0 && o < info.rows
                    ? { order: info.order, row: o, ghost: false }
                    : null;
                const row = resolved?.row ?? 0;
                const order = resolved?.order ?? info.order;
                const ghost = resolved?.ghost ?? false;
                const inRange = resolved !== null;
                const isBar = !ghost && inRange && row % beatB === 0;
                const isBeat = !ghost && inRange && !isBar && row % beatA === 0;
                const marker = ghost ? "~" : isBar ? "●" : isBeat ? "·" : " ";
                const cell = inRange ? cellAt(song, channel, order, row) : null;
                const columns = flatColumnsForChannel(song, channel);
                const heldNote =
                  !ghost && inRange
                    ? (song.channels[channel]?.noteTimeline[order]?.[row] ??
                      null)
                    : null;
                const heldInstrument = heldNote
                  ? (song.channels[channel]?.insTimeline[order]?.[row] ?? null)
                  : null;
                const heldInfo =
                  heldInstrument !== null
                    ? song.instruments[heldInstrument]
                    : undefined;
                const tint =
                  !ghost && state.colorInstruments && heldInfo
                    ? instrumentTint(heldInfo.colorRgb, isPlayhead)
                    : undefined;
                const isCursorHere =
                  !ghost &&
                  inRange &&
                  cursor.channel === channel &&
                  cursor.order === order &&
                  cursor.row === row;
                const inSelectedRows =
                  !ghost &&
                  inRange &&
                  selection !== null &&
                  selection.order === order &&
                  row >= selection.rowLo &&
                  row <= selection.rowHi;
                const beatBackground = isBar && !isPlayhead;
                return (
                  <Text key={channel}>
                    <Text
                      color={
                        ghost
                          ? "gray"
                          : isPlayhead
                            ? tint
                              ? "green"
                              : "gray"
                            : isBar
                              ? "black"
                              : isBeat
                                ? "cyan"
                                : undefined
                      }
                      backgroundColor={
                        ghost
                          ? undefined
                          : isPlayhead
                            ? undefined
                            : isBar
                              ? "gray"
                              : undefined
                      }
                      bold={!ghost && ((isPlayhead && !!tint) || isBar)}
                      dimColor={
                        !ghost &&
                        (!inRange || (!isPlayhead && !isBar && !isBeat))
                      }
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
                              ghost
                                ? "gray"
                                : isCursor
                                  ? "black"
                                  : isPlayhead && !tint
                                    ? "black"
                                    : segment.column === 0 && cell.note
                                      ? CHANNEL_COLORS[
                                          channel % CHANNEL_COLORS.length
                                        ]
                                      : undefined
                            }
                            backgroundColor={
                              ghost
                                ? undefined
                                : isCursor
                                  ? "white"
                                  : inSelection
                                    ? "blue"
                                    : (tint ??
                                      (isPlayhead && !tint
                                        ? "gray"
                                        : beatBackground
                                          ? "gray"
                                          : undefined))
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

  const body = Array.from({ length: windowSize }, (_, offset) => {
    const o = windowStart + offset;
    if (state.ghosting && (o < 0 || o >= patternLength)) {
      return renderGhostRow(
        `ghost-${o}`,
        Array.from({ length: channelCount }, (_, channel) => {
          const cell = channelStreamCell(channel, o);
          return cell ? { order: cell.order, row: cell.row } : null;
        }),
      );
    }
    const row = o;
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
                const playheadGrey =
                  isPlayheadRow &&
                  !tint &&
                  !isCursor &&
                  !inSelection &&
                  !isHighlighted;
                return (
                  <Text
                    key={index}
                    color={
                      isCursor || isHighlighted || playheadGrey
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
                            : playheadGrey
                              ? "gray"
                              : (tint ?? (beatBackground ? "gray" : undefined))
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
