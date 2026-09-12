import { useCallback, useEffect, useRef, useState } from "react";
import type { PatternCell } from "@/core/fur/types";
import {
  applyEdit,
  applySnapshot,
  cellAt,
  patternSnapshot,
  type PatternSnapshot,
  type SongModel,
} from "@/core/songModel";
import { noteToName } from "@/core/pitch";
import { rowTime, songPositionAt } from "@/core/timing";
import type { AudioBackend } from "@/audio/backend";
import {
  CLIPBOARD_TAG,
  FX_CATALOG,
  adjustCell,
  adjustNote,
  clearPatternsSnapshot,
  clearValue,
  columnLabel,
  flatColumnsForChannel,
  insertPatternAfter,
  interpolateColumn,
  readValue,
  removePatternAt,
  selectionRect,
  writeValue,
  type CellPos,
  type CellValue,
  type EditColumn,
} from "@/core/tracker";
import { useAnimationFrame } from "../hooks";

const CHANNEL_NAMES = ["PULSE 1", "PULSE 2", "WAVE", "NOISE"];
const UNDO_CAP = 20;

interface PatternGridProps {
  song: SongModel;
  backend: AudioBackend;
  editMode: boolean;
  channelMuted: boolean[];
  instrumentMuted: boolean[];
  onChanged: () => void;
  onSeek: (time: number) => void;
  onToggleChannel: (channel: number) => void;
  onAudition: (channels: number[], order: number, row: number) => void;
}

interface MenuState {
  x: number;
  y: number;
  pos: CellPos;
}

function hex(value: number | null): string {
  return value === null ? ".." : value.toString(16).toUpperCase().padStart(2, "0");
}

function effectText(effect: { effect: number | null; value: number | null }): string {
  if (effect.effect === null && effect.value === null) return "....";
  return `${hex(effect.effect)}${hex(effect.value)}`;
}

export function PatternGrid(props: PatternGridProps) {
  const { song, backend, editMode } = props;
  const [order, setOrder] = useState(0);
  const [row, setRow] = useState(0);
  const [follow, setFollow] = useState(true);
  const [tint, setTint] = useState(true);
  const [lines, setLines] = useState(true);
  const [selected, setSelected] = useState<CellPos | null>(null);
  const [anchor, setAnchor] = useState<CellPos | null>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [managerOpen, setManagerOpen] = useState(false);
  const [clearConfirm, setClearConfirm] = useState(false);
  const [undoVersion, setUndoVersion] = useState(0);

  const undoStack = useRef<PatternSnapshot[]>([]);
  const redoStack = useRef<PatternSnapshot[]>([]);
  const stateRef = useRef({ selected, anchor, order, follow, editMode });
  stateRef.current = { selected, anchor, order, follow, editMode };

  const songRef = useRef(song);
  songRef.current = song;
  const propsRef = useRef(props);
  propsRef.current = props;

  useAnimationFrame(() => {
    const pos = songPositionAt(song, backend.currentTime());
    setRow(pos.row);
    if (follow && backend.isPlaying()) setOrder(pos.orderPos);
  });

  const pushUndo = useCallback(() => {
    const stack = undoStack.current;
    if (stack.length >= UNDO_CAP) stack.shift();
    stack.push(patternSnapshot(songRef.current));
    redoStack.current = [];
    setUndoVersion((v) => v + 1);
  }, []);

  const mutate = useCallback(
    (mutator: () => void) => {
      pushUndo();
      mutator();
      propsRef.current.onChanged();
    },
    [pushUndo],
  );

  const resetView = useCallback(() => {
    undoStack.current = [];
    redoStack.current = [];
    setSelected(null);
    setAnchor(null);
    setOrder(0);
    setUndoVersion((v) => v + 1);
  }, []);

  useEffect(() => {
    if (!editMode) resetView();
  }, [editMode, resetView]);

  const commit = useCallback(
    (pos: CellPos, cell: PatternCell) => {
      mutate(() => {
        applyEdit(songRef.current, { channel: pos.channel, order: pos.order, row: pos.row, cell });
        setSelected(pos);
      });
      if (!propsRef.current.channelMuted[pos.channel]) {
        propsRef.current.onAudition([pos.channel], pos.order, pos.row);
      }
    },
    [mutate],
  );

  const undo = useCallback(() => {
    const previous = undoStack.current.pop();
    if (!previous) return;
    redoStack.current.push(patternSnapshot(songRef.current));
    applySnapshot(songRef.current, previous);
    propsRef.current.onChanged();
    setUndoVersion((v) => v + 1);
  }, []);

  const redo = useCallback(() => {
    const next = redoStack.current.pop();
    if (!next) return;
    undoStack.current.push(patternSnapshot(songRef.current));
    applySnapshot(songRef.current, next);
    propsRef.current.onChanged();
    setUndoVersion((v) => v + 1);
  }, []);

  // ---- Keyboard handling ----
  useEffect(() => {
    if (!editMode) return;
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT")) {
        return;
      }
      const model = songRef.current;
      const current = stateRef.current.selected;
      const command = event.ctrlKey || event.metaKey;

      if (command && event.key.toLowerCase() === "z") {
        event.preventDefault();
        undo();
        return;
      }
      if (command && event.key.toLowerCase() === "y") {
        event.preventDefault();
        redo();
        return;
      }
      if (!current) return;

      const flat = flatColumnsForChannel(model, current.channel);
      const columnIdx = flat.findIndex(
        (c) => c.kind === current.column.kind && (c.kind !== "fx" || c.index === (current.column as { index: number }).index),
      );
      const patternLength = model.meta.patternLength;

      if (command && event.key.toLowerCase() === "a") {
        event.preventDefault();
        const rect = selectionRect(model, current, stateRef.current.anchor);
        const allSelected = rect && rect.rowLo === 0 && rect.rowHi === patternLength - 1;
        if (allSelected && rect.colLo === 0 && rect.colHi === flat.length - 1) {
          setAnchor({ ...current, column: flat[flat.length - 1]! });
        } else {
          setAnchor({ ...current, row: 0, column: flat[0]! });
          setSelected({ ...current, row: patternLength - 1, column: flat[flat.length - 1]! });
        }
        return;
      }
      if (command && event.key.toLowerCase() === "c") {
        event.preventDefault();
        void copySelection();
        return;
      }
      if (command && event.key.toLowerCase() === "v") {
        event.preventDefault();
        void pasteSelection(event.shiftKey);
        return;
      }

      const moves: Array<[string, number, number]> = [
        ["ArrowUp", 0, -1],
        ["ArrowDown", 0, 1],
        ["ArrowLeft", -1, 0],
        ["ArrowRight", 1, 0],
      ];
      const move = moves.find(([key]) => key === event.key);
      if (move) {
        event.preventDefault();
        const [, dx, dy] = move;
        const step = command ? 16 : 1;
        if (dy !== 0) {
          if (event.shiftKey) {
            const nextRow = Math.min(Math.max(current.row + dy * step, 0), patternLength - 1);
            setAnchor(stateRef.current.anchor ?? current);
            setSelected({ ...current, row: nextRow });
          } else {
            const total = model.meta.orderLength * patternLength;
            let absolute = current.order * patternLength + current.row + dy * step;
            absolute = ((absolute % total) + total) % total;
            const nextOrder = Math.floor(absolute / patternLength);
            setFollow(false);
            setOrder(nextOrder);
            setSelected({ ...current, order: nextOrder, row: absolute % patternLength });
            setAnchor(null);
          }
        } else {
          if (command) {
            const nextChannel = ((current.channel + dx) % Math.min(model.channels.length, 4) + Math.min(model.channels.length, 4)) % Math.min(model.channels.length, 4);
            setSelected({ ...current, channel: nextChannel, column: { kind: "note" } });
            setAnchor(null);
          } else if (event.shiftKey) {
            const next = Math.min(Math.max(columnIdx + dx, 0), flat.length - 1);
            setAnchor(stateRef.current.anchor ?? current);
            setSelected({ ...current, column: flat[next]! });
          } else {
            const next = ((columnIdx + dx) % flat.length + flat.length) % flat.length;
            setSelected({ ...current, column: flat[next]! });
            setAnchor(null);
          }
        }
        return;
      }

      if (command) return;
      const cell = cellAt(model, current.channel, current.order, current.row);
      const key = event.key.toLowerCase();
      let next: PatternCell | null = null;
      if (key === "x") next = clearValue(cell, current.column);
      else if (key === "c") next = writeValue(cell, current.column, { kind: "note", value: { kind: "off" } });
      else if (key === "q") next = adjustCell(cell, current.column, 1, model.instruments.length);
      else if (key === "a") next = adjustCell(cell, current.column, -1, model.instruments.length);
      else if (key === "w") next = adjustNote(cell, 12);
      else if (key === "s") next = adjustNote(cell, -12);
      else if (key === "z") {
        const previous = readValue(cell, current.column);
        next = cell;
        void previous;
      }
      if (next) {
        event.preventDefault();
        commit(current, next);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [editMode, commit, undo, redo]);

  const copySelection = useCallback(async () => {
    const model = songRef.current;
    const current = stateRef.current.selected;
    if (!current) return;
    const rect = selectionRect(model, current, stateRef.current.anchor);
    if (!rect) return;
    const flat = flatColumnsForChannel(model, rect.channel);
    const columns = flat.slice(rect.colLo, rect.colHi + 1);
    const cells: CellValue[][] = [];
    for (let r = rect.rowLo; r <= rect.rowHi; r++) {
      const rowValues: CellValue[] = [];
      const cell = cellAt(model, rect.channel, rect.order, r);
      for (const column of columns) rowValues.push(readValue(cell, column));
      cells.push(rowValues);
    }
    const payload = JSON.stringify({ columns, cells });
    await navigator.clipboard.writeText(`${CLIPBOARD_TAG}${payload}`).catch(() => undefined);
  }, []);

  const pasteSelection = useCallback(
    async (flood: boolean) => {
      const model = songRef.current;
      const current = stateRef.current.selected;
      if (!current) return;
      let text = "";
      try {
        text = await navigator.clipboard.readText();
      } catch {
        return;
      }
      if (!text.startsWith(CLIPBOARD_TAG)) return;
      const block = JSON.parse(text.slice(CLIPBOARD_TAG.length)) as {
        columns: EditColumn[];
        cells: CellValue[][];
      };
      const flat = flatColumnsForChannel(model, current.channel);
      const startIdx = flat.findIndex(
        (c) => c.kind === current.column.kind && (c.kind !== "fx" || c.index === (current.column as { index: number }).index),
      );
      mutate(() => {
        const end = flood ? model.meta.patternLength : Math.min(current.row + block.cells.length, model.meta.patternLength);
        for (let r = current.row; r < end; r++) {
          const values = block.cells[(r - current.row) % block.cells.length]!;
          let cell = cellAt(model, current.channel, current.order, r);
          values.forEach((value, offset) => {
            const target = flat[startIdx + offset];
            if (target) cell = writeValue(cell, target, value);
          });
          applyEdit(model, { channel: current.channel, order: current.order, row: r, cell });
        }
      });
    },
    [mutate],
  );

  const applyMenuEdit = (newCell: PatternCell) => {
    if (!menu) return;
    commit({ ...menu.pos, row: menu.pos.row }, newCell);
    setMenu(null);
  };

  const interactive = editMode;
  const patternLength = song.meta.patternLength;
  const channels = song.channels.slice(0, 4);
  const rect = editMode ? selectionRect(song, selected, anchor) : null;

  const isInRange = (channel: number, r: number, column: EditColumn): boolean => {
    if (!rect || rect.channel !== channel || rect.order !== order) return false;
    if (r < rect.rowLo || r > rect.rowHi) return false;
    const flat = flatColumnsForChannel(song, channel);
    const idx = flat.findIndex((c) => c.kind === column.kind && (c.kind !== "fx" || c.index === (column as { index: number }).index));
    return idx >= rect.colLo && idx <= rect.colHi;
  };

  const isSelected = (channel: number, r: number, column: EditColumn): boolean =>
    !!selected &&
    selected.channel === channel &&
    selected.row === r &&
    selected.order === order &&
    selected.column.kind === column.kind &&
    (column.kind !== "fx" || selected.column.kind !== "fx" || selected.column.index === column.index);

  const selectCell = (channel: number, r: number, column: EditColumn, shift: boolean) => {
    if (!editMode) return;
    const pos: CellPos = { channel, order, row: r, column };
    if (shift) setAnchor(anchor ?? selected ?? pos);
    else setAnchor(null);
    setSelected(pos);
    setFollow(false);
    props.onSeek(rowTime(song, order, r));
    if (!props.channelMuted[channel]) props.onAudition([channel], order, r);
  };

  return (
    <section className="panel">
      <div className="row wrap">
        <h2 style={{ margin: 0 }}>PATTERNS</h2>
        <span className="muted small">
          {song.meta.orderLength} patterns × {patternLength} rows
        </span>
        <span className="spacer" />
        <label>
          <input type="checkbox" checked={follow} onChange={(e) => setFollow(e.target.checked)} />
          Follow playhead
        </label>
        <label>
          <input type="checkbox" checked={tint} onChange={(e) => setTint(e.target.checked)} />
          Colour instruments
        </label>
        <label>
          <input type="checkbox" checked={lines} onChange={(e) => setLines(e.target.checked)} />
          Note/beat lines
        </label>
      </div>
      <div className="row wrap">
        <label>Order</label>
        <select
          value={order}
          onChange={(e) => {
            setFollow(false);
            setOrder(Number(e.target.value));
            props.onSeek(rowTime(song, Number(e.target.value), 0));
          }}
        >
          {Array.from({ length: song.meta.orderLength }, (_, i) => {
            const patternIndex = channels[0]?.orderList[i];
            return (
              <option key={i} value={i}>
                {i.toString().padStart(2, "0")}
                {patternIndex !== undefined ? ` · pat ${patternIndex.toString().padStart(2, "0")}` : ""}
              </option>
            );
          })}
        </select>
        {editMode && (
          <>
            <button onClick={() => setManagerOpen(true)}>Pattern Manager</button>
            <button onClick={() => setHelpOpen(true)}>Keyboard Help</button>
            <button disabled={undoStack.current.length === 0} onClick={undo}>
              Undo
            </button>
            <button disabled={redoStack.current.length === 0} onClick={redo}>
              Redo
            </button>
            <span className="muted small" key={undoVersion}>
              {undoStack.current.length} undo / {redoStack.current.length} redo
            </span>
          </>
        )}
      </div>
      {editMode && (
        <p className="hint">
          Click a cell to select · arrows move · Ctrl/Cmd+arrows jump · Z/X/C/Q/A/W/S edit ·
          Ctrl+C/V copy/paste · Shift+V flood paste · right-click for menus · Ctrl+Z/Y undo/redo.
        </p>
      )}

      <div className="tracker">
        <table>
          <thead>
            <tr>
              <th className="row-col">ROW</th>
              {channels.map((_, c) => (
                <th key={c} colSpan={4} className={props.channelMuted[c] ? "muted-col" : ""}>
                  <span
                    className="channel-head"
                    onClick={() => props.onToggleChannel(c)}
                    title="Mute or unmute this channel"
                  >
                    CH{c} · {CHANNEL_NAMES[c]}
                  </span>
                </th>
              ))}
            </tr>
            <tr className="sub-head">
              <th />
              {channels.map((_, c) => (
                <SubHeaders key={c} song={song} channel={c} />
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: patternLength }, (_, r) => {
              const isPlayhead = r === row && backend.isPlaying();
              const beat = lines && r % 4 === 0;
              return (
                <tr key={r} className={isPlayhead ? "playhead" : beat ? "beat" : ""}>
                  <td
                    className="row-col mono"
                    onClick={() => {
                      props.onSeek(rowTime(song, order, r));
                      props.onAudition(
                        [0, 1, 2, 3].filter((c) => !props.channelMuted[c]),
                        order,
                        r,
                      );
                    }}
                  >
                    {r.toString(16).toUpperCase().padStart(2, "0")}
                  </td>
                  {channels.map((channel, c) => {
                    const patternIndex = channel.orderList[order];
                    const pattern =
                      patternIndex === undefined ? undefined : channel.patterns.get(patternIndex);
                    const cell = pattern?.rows[r];
                    const instrument = channel.insTimeline[order]?.[r] ?? null;
                    const muted =
                      props.channelMuted[c] ||
                      (instrument !== null && (props.instrumentMuted[instrument] ?? false));
                    const info = instrument !== null ? song.instruments[instrument] : undefined;
                    const bg =
                      tint && info
                        ? `rgba(${info.colorRgb.join(",")},${isPlayhead ? 0.34 : 0.18})`
                        : undefined;
                    const note = cell?.note ?? null;
                    const effectColumns = Math.max(channel.effectColumns, 1);
                    return (
                      <ChannelCells
                        key={c}
                        cell={cell}
                        effectColumns={effectColumns}
                        muted={muted}
                        background={bg}
                        interactive={interactive}
                        isInRange={isInRange}
                        isSelected={isSelected}
                        noteStart={!!note && note.kind === "note"}
                        channel={c}
                        row={r}
                        onSelect={(column, shift) => selectCell(c, r, column, shift)}
                        onContext={(x, y, column) => setMenu({ x, y, pos: { channel: c, order, row: r, column } })}
                      />
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {menu && (
        <ContextMenu
          song={song}
          menu={menu}
          rect={rect}
          onClose={() => setMenu(null)}
          onApply={(column, value) => {
            const cell = cellAt(song, menu.pos.channel, menu.pos.order, menu.pos.row);
            applyMenuEdit(writeValue(cell, column, value));
          }}
          onInterpolate={() => {
            if (!rect) return;
            const model = song;
            const flat = flatColumnsForChannel(model, rect.channel);
            mutate(() => {
              for (let i = rect.colLo; i <= rect.colHi; i++) {
                const column = flat[i]!;
                interpolateColumn(model, rect.channel, column, rect.order, rect.rowLo, rect.rowHi);
              }
            });
            setMenu(null);
          }}
        />
      )}

      {helpOpen && (
        <div className="modal-backdrop" onClick={() => setHelpOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">
              <span>EDIT MODE Keyboard Shortcuts</span>
              <button onClick={() => setHelpOpen(false)}>✕</button>
            </div>
            <div className="help-grid mono small">
              <span>Arrows</span><span>Move selection</span>
              <span>Ctrl/Cmd + Up/Down</span><span>Move 16 rows</span>
              <span>Ctrl/Cmd + Left/Right</span><span>Jump channel (NOTE)</span>
              <span>Shift + arrows</span><span>Extend selection</span>
              <span>Z</span><span>Enter last value / repeat</span>
              <span>X</span><span>Clear cell or range</span>
              <span>C</span><span>Note Off</span>
              <span>Q / A</span><span>Value +1 / −1</span>
              <span>W / S</span><span>Note ±1 octave</span>
              <span>Ctrl/Cmd + C / V</span><span>Copy / paste</span>
              <span>Ctrl/Cmd + Shift + V</span><span>Flood paste to end</span>
              <span>Ctrl/Cmd + A</span><span>Select column / all</span>
              <span>Ctrl/Cmd + Z / Y</span><span>Undo / redo</span>
              <span>Space</span><span>Play from pattern start / pause</span>
            </div>
          </div>
        </div>
      )}

      {managerOpen && (
        <div className="modal-backdrop" onClick={() => setManagerOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">
              <span>Pattern Manager</span>
              <button onClick={() => setManagerOpen(false)}>✕</button>
            </div>
            <div className="row">
              <button onClick={() => setClearConfirm(true)}>Clear Patterns…</button>
            </div>
            <div className="manager-list">
              {Array.from({ length: song.meta.orderLength }, (_, pos) => (
                <div className="row manager-row" key={pos}>
                  <span className="mono">{pos.toString().padStart(2, "0")}</span>
                  <button
                    disabled={pos === 0}
                    onClick={() =>
                      mutate(() => {
                        const snap = patternSnapshot(song);
                        for (const channel of snap.channels) {
                          const tmp = channel.orderList[pos]!;
                          channel.orderList[pos] = channel.orderList[pos - 1]!;
                          channel.orderList[pos - 1] = tmp;
                        }
                        applySnapshot(song, snap);
                      })
                    }
                  >
                    ↑
                  </button>
                  <button
                    disabled={pos + 1 >= song.meta.orderLength}
                    onClick={() =>
                      mutate(() => {
                        const snap = patternSnapshot(song);
                        for (const channel of snap.channels) {
                          const tmp = channel.orderList[pos]!;
                          channel.orderList[pos] = channel.orderList[pos + 1]!;
                          channel.orderList[pos + 1] = tmp;
                        }
                        applySnapshot(song, snap);
                      })
                    }
                  >
                    ↓
                  </button>
                  <button
                    onClick={() =>
                      mutate(() => {
                        const snap = patternSnapshot(song);
                        insertPatternAfter(snap, pos, patternLength, false);
                        applySnapshot(song, snap);
                      })
                    }
                  >
                    Add
                  </button>
                  <button
                    onClick={() =>
                      mutate(() => {
                        const snap = patternSnapshot(song);
                        insertPatternAfter(snap, pos, patternLength, true);
                        applySnapshot(song, snap);
                      })
                    }
                  >
                    Duplicate
                  </button>
                  <button
                    disabled={song.meta.orderLength <= 1}
                    onClick={() =>
                      mutate(() => {
                        const snap = patternSnapshot(song);
                        removePatternAt(snap, pos);
                        applySnapshot(song, snap);
                      })
                    }
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {clearConfirm && (
        <div className="modal-backdrop" onClick={() => setClearConfirm(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">
              <span>Clear Patterns?</span>
            </div>
            <p>Replace every pattern with one empty pattern per channel?</p>
            <div className="row">
              <button
                onClick={() => {
                  mutate(() => {
                    const snap = patternSnapshot(song);
                    clearPatternsSnapshot(snap, patternLength);
                    applySnapshot(song, snap);
                  });
                  setClearConfirm(false);
                  setManagerOpen(false);
                }}
              >
                Clear Patterns
              </button>
              <button onClick={() => setClearConfirm(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function SubHeaders({ song, channel }: { song: SongModel; channel: number }) {
  const effectColumns = Math.max(song.channels[channel]?.effectColumns ?? 1, 1);
  return (
    <>
      <th>NOTE</th>
      <th>INS</th>
      <th>VOL</th>
      {Array.from({ length: effectColumns }, (_, i) => (
        <th key={i}>{effectColumns > 1 ? `FX${i + 1}` : "FX"}</th>
      ))}
    </>
  );
}

interface ChannelCellsProps {
  cell: PatternCell | undefined;
  effectColumns: number;
  muted: boolean;
  background: string | undefined;
  interactive: boolean;
  isInRange: (channel: number, row: number, column: EditColumn) => boolean;
  isSelected: (channel: number, row: number, column: EditColumn) => boolean;
  noteStart: boolean;
  channel: number;
  row: number;
  onSelect: (column: EditColumn, shift: boolean) => void;
  onContext: (x: number, y: number, column: EditColumn) => void;
}

function ChannelCells(props: ChannelCellsProps) {
  const { cell, muted } = props;
  const note = cell?.note ?? null;
  const noteClass = `mono note${props.noteStart ? " on" : ""}${muted ? " muted-cell" : ""}`;
  const plain = (value: number | null) => `mono${muted ? " muted-cell" : ""}`;
  const columns: EditColumn[] = [{ kind: "note" }, { kind: "ins" }, { kind: "vol" }];
  for (let i = 0; i < props.effectColumns; i++) columns.push({ kind: "fx", index: i });

  const mk = (column: EditColumn, base: string) => ({
    className: `${base}${props.isSelected(props.channel, props.row, column) ? " selected" : ""}${
      props.isInRange(props.channel, props.row, column) ? " in-range" : ""
    }`,
    style: { background: props.background },
    onClick: (e: React.MouseEvent) => {
      if (props.interactive) props.onSelect(column, e.shiftKey);
    },
    onContextMenu: (e: React.MouseEvent) => {
      if (!props.interactive) return;
      e.preventDefault();
      props.onContext(e.clientX, e.clientY, column);
    },
  });

  return (
    <>
      <td {...mk({ kind: "note" }, noteClass)}>
        {note ? noteToName(note) : "..."}
      </td>
      <td {...mk({ kind: "ins" }, plain(cell?.instrument ?? null))}>
        {hex(cell?.instrument ?? null)}
      </td>
      <td {...mk({ kind: "vol" }, plain(cell?.volume ?? null))}>
        {hex(cell?.volume ?? null)}
      </td>
      {Array.from({ length: props.effectColumns }, (_, i) => (
        <td key={i} {...mk({ kind: "fx", index: i }, `mono fx${muted ? " muted-cell" : ""}`)}>
          {cell ? effectText(cell.effects[i] ?? { effect: null, value: null }) : "...."}
        </td>
      ))}
    </>
  );
}

interface ContextMenuProps {
  song: SongModel;
  menu: MenuState;
  rect: ReturnType<typeof selectionRect>;
  onClose: () => void;
  onApply: (column: EditColumn, value: CellValue) => void;
  onInterpolate: () => void;
}

function ContextMenu({ song, menu, rect, onClose, onApply, onInterpolate }: ContextMenuProps) {
  const column = menu.pos.column;
  const showInterpolate = rect && rect.rowHi > rect.rowLo && rect.channel === menu.pos.channel;
  return (
    <div className="context-menu" style={{ left: menu.x, top: menu.y }} onMouseLeave={onClose}>
      {showInterpolate && (
        <button className="menu-item" onClick={onInterpolate}>
          Interpolate {columnLabel(column)}
        </button>
      )}
      {column.kind === "note" && (
        <>
          <div className="menu-label">Octave 3</div>
          {Array.from({ length: 12 }, (_, i) => 96 + i).map((note) => (
            <button
              key={note}
              className="menu-item"
              onClick={() => onApply(column, { kind: "note", value: { kind: "note", note } })}
            >
              {noteToName({ kind: "note", note })}
            </button>
          ))}
          <div className="menu-label">Octave 4</div>
          {Array.from({ length: 13 }, (_, i) => 108 + i).map((note) => (
            <button
              key={note}
              className="menu-item"
              onClick={() => onApply(column, { kind: "note", value: { kind: "note", note } })}
            >
              {noteToName({ kind: "note", note })}
            </button>
          ))}
        </>
      )}
      {column.kind === "ins" && (
        <>
          <div className="menu-label">Instrument</div>
          {song.instruments.map((instrument, index) => (
            <button
              key={index}
              className="menu-item"
              onClick={() => onApply(column, { kind: "ins", value: index })}
            >
              {index.toString(16).toUpperCase().padStart(2, "0")}: {instrument.name}
            </button>
          ))}
        </>
      )}
      {column.kind === "vol" && (
        <>
          <div className="menu-label">Volume</div>
          {Array.from({ length: 16 }, (_, v) => (
            <button
              key={v}
              className="menu-item"
              onClick={() => onApply(column, { kind: "vol", value: v })}
            >
              {v.toString(16).toUpperCase()}
            </button>
          ))}
        </>
      )}
      {column.kind === "fx" && (
        <>
          <div className="menu-label">Effect</div>
          {FX_CATALOG.map((entry) => (
            <button
              key={entry.code}
              className="menu-item"
              onClick={() =>
                onApply(column, { kind: "fx", value: { effect: entry.code, value: 0 } })
              }
            >
              {entry.label} — {entry.description}
            </button>
          ))}
        </>
      )}
    </div>
  );
}
