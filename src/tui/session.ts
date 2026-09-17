import { WebAudioBackend } from "@/audio/webAudioBackend";
import type { NoteValue, PatternCell } from "@/core/fur/types";
import { defaultMasterFx, type MasterFxSettings } from "@/core/masterFx";
import {
  applyEdit,
  applySnapshot,
  buildSongModel,
  buildSongModelFromProject,
  cellAt,
  patternSnapshot,
  retime,
  type SongModel,
} from "@/core/songModel";
import {
  applyTimingOverrides,
  projectFromJson,
  validateProject,
  type ProjectFile,
} from "@/core/project";
import {
  defaultSamplerSettings,
  sequenceFromSong,
  type SamplerSettings,
} from "@/core/sampler";
import { rowTime, songPositionAt } from "@/core/timing";
import { cloneTarget, type BuildTarget } from "@/core/stepthrough";
import {
  adjustCell,
  applyLastValue as applyLastValueToCell,
  clearPatternsSnapshot,
  CLIPBOARD_TAG,
  clearValue,
  columnIndex,
  defaultLastValues,
  flatColumns,
  flatColumnsForChannel,
  globalColumnIndex,
  insertPatternAfter,
  interpolateColumn,
  moveOrder as moveOrderSnapshot,
  readValue,
  recordLastValue,
  removePatternAt as removePatternAtSnapshot,
  selectionRect,
  setOrderPattern,
  writeValue,
  type CellPos,
  type CellValue,
  type EditColumn,
  type LastValues,
} from "@/core/tracker";
import { installWebAudioGlobals } from "@/runtime/audio";
import { loadDefaultSong } from "@/runtime/assets";
import type { LoadedSong } from "@/shared/types";

export interface Cursor {
  order: number;
  channel: number;
  row: number;
  column: number;
}

export interface SessionState {
  status: string;
  error: string | null;
  song: SongModel | null;
  project: ProjectFile | null;
  settings: SamplerSettings[];
  sampleNames: string[];
  channelVolume: number[];
  channelMuted: boolean[];
  masterVolume: number;
  masterFx: MasterFxSettings;
  reference: boolean;
  /** Original `.fur` bytes, for `/export fur` (null for project-only songs). */
  furBytes: Uint8Array | null;
  wasmReady: boolean;
  playing: boolean;
  time: number;
  duration: number;
  /** Order currently shown in the tracker view. */
  viewOrder: number;
  cursor: Cursor;
  /** Other end of the block selection, or null when nothing is selected. */
  selectionAnchor: Cursor | null;
  /** Rows advanced after entering a value. */
  step: number;
  /** When true, the tracker view follows the playhead while playing. */
  follow: boolean;
  /** When true, pattern cells are tinted by the instrument of the held note. */
  colorInstruments: boolean;
  /** Row the view scrolls to while following (null when not following). */
  viewRow: number | null;
  dirty: boolean;
  /** Recent slash commands, newest last (for Ctrl+P / Ctrl+N recall). */
  commandHistory: string[];
  /** Unix-socket path of the live control server (null when disabled). */
  controlPath: string | null;
}

interface HistoryEntry {
  channel: number;
  order: number;
  row: number;
  before: PatternCell;
  after: PatternCell;
}

type HistoryGroup = HistoryEntry[];

function initialState(): SessionState {
  return {
    status: "Starting…",
    error: null,
    song: null,
    project: null,
    settings: [],
    sampleNames: [],
    channelVolume: [1, 1, 1, 1],
    channelMuted: [false, false, false, false],
    masterVolume: 1,
    masterFx: defaultMasterFx(),
    reference: false,
    furBytes: null,
    wasmReady: false,
    playing: false,
    time: 0,
    duration: 0,
    viewOrder: 0,
    cursor: { order: 0, channel: 0, row: 0, column: 0 },
    selectionAnchor: null,
    step: 1,
    follow: true,
    colorInstruments: true,
    viewRow: null,
    dirty: false,
    commandHistory: [],
    controlPath: null,
  };
}

/**
 * Headless, framework-agnostic app session: loads the song, owns the audio
 * backend and exposes every action as a method. The Ink UI and any future
 * script/agent driver talk to this and nothing else.
 */
export class Session {
  private state: SessionState = initialState();
  private listeners = new Set<() => void>();
  private engine: WebAudioBackend | null = null;
  private history: HistoryGroup[] = [];
  private redoStack: HistoryGroup[] = [];
  private last = defaultLastValues();
  private lastOctave = 4;
  private clipboard: string | null = null;
  private historyCursor: number | null = null;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getState = (): SessionState => this.state;

  private patch(partial: Partial<SessionState>): void {
    this.state = { ...this.state, ...partial };
    for (const listener of this.listeners) listener();
  }

  private notify(): void {
    for (const listener of this.listeners) listener();
  }

  get song(): SongModel | null {
    return this.state.song;
  }

  /**
   * Deep-clones the model fields into a BuildTarget for stepthrough preview.
   * The live session is never mutated by the preview; callers apply steps to a
   * clone of this snapshot.
   */
  snapshotTarget(): BuildTarget | null {
    const state = this.state;
    if (!state.song || !state.project) return null;
    return {
      project: structuredClone(state.project),
      song: structuredClone(state.song),
      settings: structuredClone(state.settings),
      channelVolume: [...state.channelVolume],
      channelMuted: [...state.channelMuted],
      masterVolume: state.masterVolume,
      masterFx: structuredClone(state.masterFx),
    };
  }

  get backend(): WebAudioBackend | null {
    return this.engine;
  }

  /** Loads the bundled default song and wires up the audio backend. */
  async init(): Promise<void> {
    installWebAudioGlobals();
    this.patch({ status: "Loading bundled song…" });
    try {
      const result = await loadDefaultSong();
      await this.applyLoaded(result);
    } catch (error) {
      this.patch({ error: String(error), status: "" });
    }
  }

  async load(song: LoadedSong | { error: string }): Promise<void> {
    await this.applyLoaded(song);
  }

  private async applyLoaded(
    result: Awaited<ReturnType<typeof loadDefaultSong>>,
  ): Promise<void> {
    if ("error" in result && result.error) {
      this.patch({ error: result.error, status: "" });
      return;
    }
    if (!("project" in result)) return;

    const loadedProject = projectFromJson(result.project);
    let model: SongModel;
    if (result.raw) {
      model = buildSongModel(result.raw);
      if (loadedProject.patternSnapshot)
        applySnapshot(model, loadedProject.patternSnapshot);
      applyTimingOverrides(loadedProject, model);
    } else {
      model = buildSongModelFromProject(loadedProject);
    }
    validateProject(loadedProject, model.instruments.length);
    loadedProject.instrumentNames.forEach((name, i) => {
      if (model.instruments[i]) model.instruments[i]!.name = name;
    });

    const settings = model.instruments.map(
      (_, i) => loadedProject.instruments[i] ?? defaultSamplerSettings(),
    );
    loadedProject.mutedInstruments.forEach((muted, i) => {
      if (settings[i]) settings[i]!.muted = !!muted;
    });

    this.engine?.dispose();
    const engine = new WebAudioBackend();
    engine.ensureStarted();
    for (let c = 0; c < 4; c++) {
      engine.setChannelVolume(c, loadedProject.channelVolume[c] ?? 1);
      engine.setChannelMute(c, loadedProject.mutedChannels[c] ?? false);
    }
    engine.setMasterVolume(loadedProject.masterVolume);
    engine.setMasterFx(loadedProject.masterFx);
    const sampleBytes: Array<Uint8Array | null> = Array.from(
      { length: 6 },
      (_, i) => result.samples[i] ?? null,
    );
    engine.loadSampler(sequenceFromSong(model), settings, sampleBytes);
    this.engine = engine;

    this.history = [];
    this.redoStack = [];
    this.historyCursor = null;
    this.patch({
      error: null,
      song: model,
      project: loadedProject,
      settings,
      sampleNames: loadedProject.sourceSamples.map(
        (sample) => sample?.name ?? "",
      ),
      channelVolume: loadedProject.channelVolume.slice(0, 4),
      channelMuted: loadedProject.mutedChannels.slice(0, 4),
      masterVolume: loadedProject.masterVolume,
      masterFx: loadedProject.masterFx,
      reference: loadedProject.refPitchEnabled,
      furBytes: result.furBytes ?? null,
      status: `${model.meta.name} — ${model.instruments.length} instruments`,
      dirty: false,
      viewOrder: 0,
      cursor: { order: 0, channel: 0, row: 0, column: 0 },
      selectionAnchor: null,
      follow: true,
      viewRow: null,
      time: 0,
      duration: engine.songDuration(),
    });
  }

  /** Polls the backend for the transport position; cheap enough to call often. */
  refreshPlayhead(): void {
    const engine = this.engine;
    if (!engine) return;
    const playing = engine.isPlaying();
    const time = engine.currentTime();
    const updates: Partial<SessionState> = {};
    if (
      playing !== this.state.playing ||
      Math.abs(time - this.state.time) >= 0.001
    ) {
      updates.playing = playing;
      updates.time = time;
    }
    // Follow mode scrolls the *view* with the playhead and keeps the edit
    // cursor in the playing order; the cursor's row is left alone so editing
    // and manual row movement never turn follow off.
    const song = this.state.song;
    if (playing && this.state.follow && song) {
      const position = songPositionAt(song, time);
      if (position.orderPos !== this.state.viewOrder) {
        updates.viewOrder = position.orderPos;
      }
      if (position.row !== this.state.viewRow) updates.viewRow = position.row;
      if (this.state.cursor.order !== position.orderPos) {
        updates.cursor = { ...this.state.cursor, order: position.orderPos };
      }
    } else if (this.state.viewRow !== null) {
      updates.viewRow = null;
    }
    if (Object.keys(updates).length === 0) return;
    this.patch(updates);
  }

  setFollow(follow: boolean): void {
    this.patch({ follow });
  }

  setColorInstruments(colorInstruments: boolean): void {
    this.patch({ colorInstruments });
  }

  /** Current order/row under the playhead, or null when not playing. */
  playheadPosition(): { order: number; row: number } | null {
    const song = this.state.song;
    if (!song || !this.state.playing) return null;
    const position = songPositionAt(song, this.state.time);
    return { order: position.orderPos, row: position.row };
  }

  // ---- transport -----------------------------------------------------------

  play(): void {
    const engine = this.engine;
    if (!engine) return;
    engine.ensureStarted();
    const song = this.state.song;
    const start = song
      ? rowTime(song, this.state.viewOrder, 0)
      : engine.currentTime();
    if (engine.isPlaying()) engine.seek(start);
    else engine.play(start);
    this.refreshPlayhead();
  }

  /** Ctrl+Space: play from the selected cell. */
  playFromCursor(): void {
    const engine = this.engine;
    if (!engine) return;
    engine.ensureStarted();
    const song = this.state.song;
    const start = song
      ? rowTime(song, this.state.cursor.order, this.state.cursor.row)
      : engine.currentTime();
    if (engine.isPlaying()) engine.seek(start);
    else engine.play(start);
    this.refreshPlayhead();
  }

  pause(): void {
    this.engine?.pause();
    this.refreshPlayhead();
  }

  togglePlay(): void {
    if (this.engine?.isPlaying()) this.pause();
    else this.play();
  }

  stop(): void {
    this.engine?.stop();
    this.patch({ playing: false, time: 0 });
  }

  seek(seconds: number): void {
    const clamped = Math.max(0, seconds);
    this.engine?.seek(clamped);
    this.patch({ time: clamped });
  }

  seekTo(order: number, row = 0): void {
    const song = this.state.song;
    if (!song) return;
    this.setViewOrder(order);
    this.seek(rowTime(song, order, row));
  }

  setViewOrder(order: number): void {
    const song = this.state.song;
    const max = song ? Math.max(song.meta.orderLength - 1, 0) : 0;
    const clamped = Math.min(Math.max(order, 0), max);
    this.patch({
      viewOrder: clamped,
      cursor: { ...this.state.cursor, order: clamped },
    });
  }

  // ---- cursor / selection --------------------------------------------------

  private cursorCellPos(): CellPos | null {
    const song = this.state.song;
    if (!song) return null;
    const { cursor } = this.state;
    const column = flatColumnsForChannel(song, cursor.channel)[cursor.column];
    if (!column) return null;
    return {
      channel: cursor.channel,
      order: cursor.order,
      row: cursor.row,
      column,
    };
  }

  /** Rectangular selection in view coordinates, or null when nothing is selected. */
  selection(): {
    order: number;
    rowLo: number;
    rowHi: number;
    colLo: number;
    colHi: number;
  } | null {
    const song = this.state.song;
    if (!song || !this.state.selectionAnchor) return null;
    const selected = this.cursorCellPos();
    if (!selected) return null;
    const anchor = this.cursorToCellPos(this.state.selectionAnchor);
    if (!anchor) return null;
    return selectionRect(song, selected, anchor);
  }

  private cursorToCellPos(cursor: Cursor): CellPos | null {
    const song = this.state.song;
    if (!song) return null;
    const column = flatColumnsForChannel(song, cursor.channel)[cursor.column];
    if (!column) return null;
    return {
      channel: cursor.channel,
      order: cursor.order,
      row: cursor.row,
      column,
    };
  }

  extendSelection(delta: {
    order?: number;
    channel?: number;
    row?: number;
    column?: number;
  }): void {
    if (!this.state.selectionAnchor)
      this.patch({ selectionAnchor: { ...this.state.cursor } });
    this.moveCursor(delta, true);
  }

  clearSelection(): void {
    if (this.state.selectionAnchor) this.patch({ selectionAnchor: null });
  }

  moveCursor(
    delta: { order?: number; channel?: number; row?: number; column?: number },
    keepSelection = false,
  ): void {
    const song = this.state.song;
    if (!song) return;
    const cursor = { ...this.state.cursor };
    const selectionAnchor = keepSelection
      ? (this.state.selectionAnchor ?? { ...cursor })
      : null;
    const patternLength = Math.max(song.meta.patternLength, 1);
    const orderLength = Math.max(song.meta.orderLength, 1);
    const totalRows = orderLength * patternLength;
    const channelCount = Math.min(song.channels.length, 4);

    if (delta.row !== undefined && delta.row !== 0) {
      if (keepSelection) {
        cursor.row = Math.min(
          Math.max(cursor.row + delta.row, 0),
          patternLength - 1,
        );
        this.patch({ cursor, selectionAnchor });
      } else {
        // Rows wrap across pattern boundaries (moving past the last row goes
        // to the next order, and before the first row to the previous one).
        let absolute = cursor.order * patternLength + cursor.row + delta.row;
        absolute = ((absolute % totalRows) + totalRows) % totalRows;
        cursor.order = Math.floor(absolute / patternLength);
        cursor.row = absolute % patternLength;
        this.patch({ cursor, selectionAnchor, viewOrder: cursor.order });
      }
      return;
    }
    if (delta.order !== undefined && delta.order !== 0) {
      if (keepSelection) {
        cursor.order = Math.min(
          Math.max(cursor.order + delta.order, 0),
          orderLength - 1,
        );
      } else {
        // Orders cycle (wrapping past the last back to the first).
        cursor.order =
          (((cursor.order + delta.order) % orderLength) + orderLength) %
          orderLength;
      }
      this.patch({ cursor, selectionAnchor, viewOrder: cursor.order });
      return;
    }
    if (delta.channel !== undefined && delta.channel !== 0) {
      cursor.channel =
        (cursor.channel + delta.channel + channelCount) % channelCount;
      cursor.column = 0; // Ctrl+Left/Right jumps to the NOTE column.
      this.patch({ cursor, selectionAnchor });
      return;
    }
    if (delta.column !== undefined && delta.column !== 0) {
      const flat = flatColumns(song);
      const currentColumn = flatColumnsForChannel(song, cursor.channel)[
        cursor.column
      ];
      if (!currentColumn) return;
      const index = globalColumnIndex(song, cursor.channel, currentColumn);
      let next = index + delta.column;
      if (keepSelection) next = Math.min(Math.max(next, 0), flat.length - 1);
      else next = ((next % flat.length) + flat.length) % flat.length;
      const target = flat[next];
      if (!target) return;
      cursor.channel = target.channel;
      cursor.column = columnIndex(song, target.channel, target.column);
      this.patch({ cursor, selectionAnchor });
    }
  }

  setCursor(partial: Partial<Cursor>): void {
    const song = this.state.song;
    if (!song) return;
    const cursor = { ...this.state.cursor, ...partial };
    cursor.order = Math.min(
      Math.max(cursor.order, 0),
      song.meta.orderLength - 1,
    );
    cursor.channel = Math.min(
      Math.max(cursor.channel, 0),
      Math.min(song.channels.length, 4) - 1,
    );
    cursor.row = Math.min(Math.max(cursor.row, 0), song.meta.patternLength - 1);
    const columns = flatColumnsForChannel(song, cursor.channel).length;
    cursor.column = Math.min(Math.max(cursor.column, 0), columns - 1);
    this.patch({ cursor, viewOrder: cursor.order });
  }

  setStep(step: number): void {
    this.patch({ step: Math.min(Math.max(Math.round(step), 0), 64) });
  }

  // ---- editing -------------------------------------------------------------

  /** Writes a value into the cursor cell and re-sequences playback. */
  editCell(patchValue: {
    note?: NoteValue | null;
    instrument?: number | null;
    volume?: number | null;
  }): void {
    const song = this.state.song;
    if (!song) return;
    const { channel, order, row, column } = this.state.cursor;
    const before = cellAt(song, channel, order, row);
    const columnDef = flatColumnsForChannel(song, channel)[column];
    if (!columnDef) return;
    let after = before;
    if (columnDef.kind === "note" && patchValue.note !== undefined) {
      after = writeValue(after, columnDef, {
        kind: "note",
        value: patchValue.note,
      });
      if (
        patchValue.instrument === undefined &&
        patchValue.note &&
        patchValue.note.kind === "note"
      ) {
        after = writeValue(
          after,
          { kind: "ins" },
          { kind: "ins", value: this.last.ins },
        );
      }
    } else if (
      columnDef.kind === "ins" &&
      patchValue.instrument !== undefined
    ) {
      after = writeValue(after, columnDef, {
        kind: "ins",
        value: patchValue.instrument,
      });
    } else if (columnDef.kind === "vol" && patchValue.volume !== undefined) {
      after = writeValue(after, columnDef, {
        kind: "vol",
        value: patchValue.volume,
      });
    } else {
      return;
    }
    recordLastValue(this.last, columnDef, after);
    this.commit([{ channel, order, row, before, after }]);
    const step = this.state.step;
    if (step > 0) this.moveCursor({ row: step });
  }

  /** q/a: bump the value under the cursor (note semitone, ins/vol/fx digit). */
  adjustValue(delta: number): void {
    const song = this.state.song;
    if (!song) return;
    const rect = this.selection();
    const flat = flatColumns(song);
    const entries: HistoryEntry[] = [];
    const adjust = (
      channel: number,
      order: number,
      row: number,
      column: EditColumn,
    ) => {
      const before = cellAt(song, channel, order, row);
      const after = adjustCell(before, column, delta, song.instruments.length);
      if (after !== before)
        entries.push({ channel, order, row, before, after });
    };
    if (rect) {
      // A multi-column selection only retunes notes (matches the original).
      const singleColumn = rect.colLo === rect.colHi;
      for (let row = rect.rowLo; row <= rect.rowHi; row++) {
        for (let ci = rect.colLo; ci <= rect.colHi; ci++) {
          const fc = flat[ci]!;
          if (!singleColumn && fc.column.kind !== "note") continue;
          adjust(fc.channel, rect.order, row, fc.column);
        }
      }
    } else {
      const { channel, order, row, column } = this.state.cursor;
      const columnDef = flatColumnsForChannel(song, channel)[column];
      if (!columnDef) return;
      adjust(channel, order, row, columnDef);
    }
    if (entries.length === 0) return;
    this.commit(entries);
    const focusColumn = flatColumnsForChannel(song, this.state.cursor.channel)[
      this.state.cursor.column
    ];
    if (focusColumn) {
      recordLastValue(
        this.last,
        focusColumn,
        cellAt(
          song,
          this.state.cursor.channel,
          this.state.cursor.order,
          this.state.cursor.row,
        ),
      );
    }
  }

  /** C: write a note-off into the selected note columns. */
  noteOff(): void {
    const song = this.state.song;
    if (!song) return;
    const rect = this.selection();
    const flat = flatColumns(song);
    const entries: HistoryEntry[] = [];
    const apply = (
      channel: number,
      order: number,
      row: number,
      column: EditColumn,
    ) => {
      if (column.kind !== "note") return;
      const before = cellAt(song, channel, order, row);
      const after = writeValue(before, column, {
        kind: "note",
        value: { kind: "off" },
      });
      entries.push({ channel, order, row, before, after });
    };
    if (rect) {
      for (let row = rect.rowLo; row <= rect.rowHi; row++) {
        for (let ci = rect.colLo; ci <= rect.colHi; ci++) {
          const fc = flat[ci]!;
          apply(fc.channel, rect.order, row, fc.column);
        }
      }
    } else {
      const { channel, order, row, column } = this.state.cursor;
      const columnDef = flatColumnsForChannel(song, channel)[column];
      if (!columnDef) return;
      apply(channel, order, row, columnDef);
    }
    if (entries.length > 0) this.commit(entries);
  }

  /** Ctrl+A: select the current column, or the whole pattern when already selected. */
  selectAll(): void {
    const song = this.state.song;
    if (!song) return;
    const flat = flatColumns(song);
    const cursor = this.state.cursor;
    const current = this.cursorCellPos();
    if (!current || flat.length === 0) return;
    const columnIdx = globalColumnIndex(song, current.channel, current.column);
    const rect = this.selection();
    const patternLength = song.meta.patternLength;
    const wholeColumn =
      rect !== null &&
      rect.rowLo === 0 &&
      rect.rowHi === patternLength - 1 &&
      rect.colLo === columnIdx &&
      rect.colHi === columnIdx;
    if (wholeColumn) {
      const first = flat[0]!;
      const last = flat[flat.length - 1]!;
      this.patch({
        selectionAnchor: {
          order: cursor.order,
          channel: first.channel,
          column: columnIndex(song, first.channel, first.column),
          row: 0,
        },
        cursor: {
          order: cursor.order,
          channel: last.channel,
          column: columnIndex(song, last.channel, last.column),
          row: patternLength - 1,
        },
      });
    } else {
      this.patch({
        selectionAnchor: { ...cursor, row: 0 },
        cursor: { ...cursor, row: patternLength - 1 },
      });
    }
  }

  /** Writes the tracked "last value" into the cursor cell. */
  applyLastValue(): void {
    const song = this.state.song;
    if (!song) return;
    const { channel, order, row, column } = this.state.cursor;
    const columnDef = flatColumnsForChannel(song, channel)[column];
    if (!columnDef) return;
    const before = cellAt(song, channel, order, row);
    const after = applyLastValueToCell(before, columnDef, this.last);
    this.commit([{ channel, order, row, before, after }]);
  }

  clearCell(): void {
    const song = this.state.song;
    if (!song) return;
    const { channel, order, row, column } = this.state.cursor;
    const columnDef = flatColumnsForChannel(song, channel)[column];
    if (!columnDef) return;
    const before = cellAt(song, channel, order, row);
    const after = clearValue(before, columnDef);
    this.commit([{ channel, order, row, before, after }]);
  }

  private commit(entries: HistoryEntry[]): void {
    const song = this.state.song;
    if (!song || entries.length === 0) return;
    for (const entry of entries) {
      applyEdit(song, {
        channel: entry.channel,
        order: entry.order,
        row: entry.row,
        cell: entry.after,
      });
    }
    this.history.push(entries);
    this.redoStack = [];
    this.engine?.updateSequence(sequenceFromSong(song));
    this.patch({ dirty: true });
  }

  private applyEntries(
    entries: HistoryEntry[],
    which: "before" | "after",
  ): void {
    const song = this.state.song;
    if (!song) return;
    for (const entry of entries) {
      applyEdit(song, {
        channel: entry.channel,
        order: entry.order,
        row: entry.row,
        cell: entry[which],
      });
    }
    this.engine?.updateSequence(sequenceFromSong(song));
    this.patch({ dirty: true });
  }

  undo(): boolean {
    const group = this.history.pop();
    if (!group) return false;
    this.applyEntries(group, "before");
    this.redoStack.push(group);
    return true;
  }

  redo(): boolean {
    const group = this.redoStack.pop();
    if (!group) return false;
    this.applyEntries(group, "after");
    this.history.push(group);
    return true;
  }

  // ---- block operations ----------------------------------------------------

  copySelection(): boolean {
    const song = this.state.song;
    const rect = this.selection();
    if (!song || !rect) return false;
    const flat = flatColumns(song);
    const columns = flat.slice(rect.colLo, rect.colHi + 1);
    const cells: CellValue[][] = [];
    for (let row = rect.rowLo; row <= rect.rowHi; row++) {
      cells.push(
        columns.map((fc) =>
          readValue(cellAt(song, fc.channel, rect.order, row), fc.column),
        ),
      );
    }
    this.clipboard = `${CLIPBOARD_TAG}${JSON.stringify({
      columns: columns.map((fc) => fc.column),
      cells,
    })}`;
    return true;
  }

  cutSelection(): boolean {
    if (!this.copySelection()) return false;
    const song = this.state.song;
    const rect = this.selection();
    if (!song || !rect) return false;
    const flat = flatColumns(song);
    const entries: HistoryEntry[] = [];
    for (let row = rect.rowLo; row <= rect.rowHi; row++) {
      const byChannel = new Map<number, PatternCell>();
      for (let ci = rect.colLo; ci <= rect.colHi; ci++) {
        const fc = flat[ci]!;
        const before =
          byChannel.get(fc.channel) ??
          cellAt(song, fc.channel, rect.order, row);
        byChannel.set(fc.channel, clearValue(before, fc.column));
      }
      for (const [ch, after] of byChannel) {
        entries.push({
          channel: ch,
          order: rect.order,
          row,
          before: cellAt(song, ch, rect.order, row),
          after,
        });
      }
    }
    this.commit(entries);
    return true;
  }

  /** Pastes the internal clipboard at the cursor; `flood` repeats to the pattern end. */
  pasteSelection(flood = false): boolean {
    const song = this.state.song;
    if (!song || !this.clipboard || !this.clipboard.startsWith(CLIPBOARD_TAG))
      return false;
    let block: { columns: EditColumn[]; cells: CellValue[][] };
    try {
      block = JSON.parse(this.clipboard.slice(CLIPBOARD_TAG.length));
    } catch {
      return false;
    }
    if (!block.cells?.length) return false;
    const { channel, order, row } = this.state.cursor;
    const flat = flatColumns(song);
    const startIndex = globalColumnIndex(
      song,
      channel,
      flatColumnsForChannel(song, channel)[this.state.cursor.column]!,
    );
    const end = flood
      ? song.meta.patternLength
      : Math.min(row + block.cells.length, song.meta.patternLength);
    const entries: HistoryEntry[] = [];
    for (let r = row; r < end; r++) {
      const values = block.cells[(r - row) % block.cells.length]!;
      const byChannel = new Map<number, PatternCell>();
      values.forEach((value, offset) => {
        const target = flat[startIndex + offset];
        if (!target) return;
        const before =
          byChannel.get(target.channel) ??
          cellAt(song, target.channel, order, r);
        byChannel.set(target.channel, writeValue(before, target.column, value));
      });
      for (const [ch, after] of byChannel) {
        entries.push({
          channel: ch,
          order,
          row: r,
          before: cellAt(song, ch, order, r),
          after,
        });
      }
    }
    this.commit(entries);
    return true;
  }

  /** Transposes notes in the selection by `delta` semitones. */
  transposeSelection(delta: number): boolean {
    const song = this.state.song;
    const rect = this.selection();
    if (!song || !rect) return false;
    const flat = flatColumns(song);
    const entries: HistoryEntry[] = [];
    for (let row = rect.rowLo; row <= rect.rowHi; row++) {
      const byChannel = new Map<number, PatternCell>();
      for (let ci = rect.colLo; ci <= rect.colHi; ci++) {
        const fc = flat[ci]!;
        const before =
          byChannel.get(fc.channel) ??
          cellAt(song, fc.channel, rect.order, row);
        byChannel.set(
          fc.channel,
          adjustCell(before, fc.column, delta, song.instruments.length),
        );
      }
      for (const [ch, after] of byChannel) {
        const before = cellAt(song, ch, rect.order, row);
        if (before === after) continue;
        entries.push({ channel: ch, order: rect.order, row, before, after });
      }
    }
    if (entries.length === 0) return false;
    this.commit(entries);
    return true;
  }

  /** Linearly interpolates each selected column between its endpoints. */
  interpolateSelection(): boolean {
    const song = this.state.song;
    const rect = this.selection();
    if (!song || !rect || rect.rowHi <= rect.rowLo) return false;
    const flat = flatColumns(song);
    const entries: HistoryEntry[] = [];
    for (let ci = rect.colLo; ci <= rect.colHi; ci++) {
      const fc = flat[ci]!;
      const before = snapshotColumn(
        song,
        fc.channel,
        fc.column,
        rect.order,
        rect.rowLo,
        rect.rowHi,
      );
      interpolateColumn(
        song,
        fc.channel,
        fc.column,
        rect.order,
        rect.rowLo,
        rect.rowHi,
      );
      const after = snapshotColumn(
        song,
        fc.channel,
        fc.column,
        rect.order,
        rect.rowLo,
        rect.rowHi,
      );
      for (let i = 0; i < before.length; i++) {
        if (before[i] !== after[i]) {
          entries.push({
            channel: fc.channel,
            order: rect.order,
            row: rect.rowLo + i,
            before: before[i]!,
            after: after[i]!,
          });
        }
      }
    }
    if (entries.length === 0) return false;
    // interpolateColumn already mutated the model; commit() would re-apply
    // identical values, so record history without re-applying.
    this.history.push(entries);
    this.redoStack = [];
    this.engine?.updateSequence(sequenceFromSong(song));
    this.patch({ dirty: true });
    return true;
  }

  // ---- order / pattern structure ------------------------------------------

  /** Inserts a new order after the viewed one; `duplicate` clones the current pattern. */
  insertPattern(duplicate = false): boolean {
    return this.insertPatternAt(this.state.viewOrder, duplicate);
  }

  /** Inserts a new order after `order`; `duplicate` clones that pattern. */
  insertPatternAt(order: number, duplicate = false): boolean {
    const song = this.state.song;
    if (!song) return false;
    const pos = Math.min(Math.max(order, 0), song.meta.orderLength - 1);
    const snapshot = patternSnapshot(song);
    insertPatternAfter(snapshot, pos, song.meta.patternLength, duplicate);
    applySnapshot(song, snapshot);
    this.history = [];
    this.redoStack = [];
    this.patch({
      dirty: true,
      viewOrder: Math.min(pos + 1, song.meta.orderLength - 1),
    });
    return true;
  }

  removePattern(): boolean {
    return this.removePatternAt(this.state.viewOrder);
  }

  removePatternAt(order: number): boolean {
    const song = this.state.song;
    if (!song || song.meta.orderLength <= 1) return false;
    const pos = Math.min(Math.max(order, 0), song.meta.orderLength - 1);
    const snapshot = patternSnapshot(song);
    removePatternAtSnapshot(snapshot, pos);
    applySnapshot(song, snapshot);
    this.history = [];
    this.redoStack = [];
    this.patch({
      dirty: true,
      viewOrder: Math.min(pos, song.meta.orderLength - 1),
    });
    return true;
  }

  /** Re-arranges: swaps an order position with its neighbour across channels. */
  moveOrder(order: number, direction: -1 | 1): boolean {
    const song = this.state.song;
    if (!song) return false;
    const pos = Math.min(Math.max(order, 0), song.meta.orderLength - 1);
    const snapshot = patternSnapshot(song);
    if (!moveOrderSnapshot(snapshot, pos, direction)) return false;
    applySnapshot(song, snapshot);
    this.history = [];
    this.redoStack = [];
    this.patch({ dirty: true, viewOrder: pos + direction });
    return true;
  }

  /** Re-points an order position at a channel-0 pattern number. */
  setOrderPatternNumber(order: number, patternIndex: number): boolean {
    const song = this.state.song;
    if (!song) return false;
    const pos = Math.min(Math.max(order, 0), song.meta.orderLength - 1);
    const next = Math.min(Math.max(Math.round(patternIndex), 0), 255);
    const snapshot = patternSnapshot(song);
    if (!setOrderPattern(snapshot, pos, next, song.meta.patternLength))
      return false;
    applySnapshot(song, snapshot);
    this.history = [];
    this.redoStack = [];
    this.patch({ dirty: true });
    return true;
  }

  /** Clears every pattern (keeps the current song meta / instruments). */
  clearAllPatterns(): boolean {
    const song = this.state.song;
    if (!song) return false;
    const snapshot = patternSnapshot(song);
    clearPatternsSnapshot(snapshot, song.meta.patternLength);
    applySnapshot(song, snapshot);
    this.history = [];
    this.redoStack = [];
    this.patch({ dirty: true, viewOrder: 0 });
    return true;
  }

  // ---- command history -----------------------------------------------------

  recordCommand(line: string): void {
    const trimmed = line.trim();
    if (!trimmed) return;
    const history = this.state.commandHistory.filter(
      (entry) => entry !== trimmed,
    );
    history.push(trimmed);
    if (history.length > 100) history.shift();
    this.historyCursor = null;
    this.patch({ commandHistory: history });
  }

  /** Recalls an earlier command (newest first) for Ctrl+P / Ctrl+N. */
  recallCommand(direction: -1 | 1): string | null {
    const history = this.state.commandHistory;
    if (history.length === 0) return null;
    let index: number;
    if (this.historyCursor === null) {
      index = direction === -1 ? history.length - 1 : history.length - 1;
    } else {
      index = this.historyCursor + direction;
    }
    index = Math.min(Math.max(index, 0), history.length - 1);
    this.historyCursor = index;
    return history[index] ?? null;
  }

  // ---- note names ----------------------------------------------------------

  noteNameToValue(name: string): NoteValue | null {
    const match = /^([A-Ga-g][#-]?)(-?\d+)$/.exec(name.trim());
    if (!match) {
      if (/^off$/i.test(name.trim())) return { kind: "off" };
      return null;
    }
    const letters = [
      "C",
      "C#",
      "D",
      "D#",
      "E",
      "F",
      "F#",
      "G",
      "G#",
      "A",
      "A#",
      "B",
    ];
    const letter = match[1]!.toUpperCase().replace("-", "");
    const semitone = letters.indexOf(letter);
    if (semitone < 0) return null;
    const octave = Number(match[2]);
    return { kind: "note", note: 60 + semitone + octave * 12 };
  }

  get lastOctaveValue(): number {
    return this.lastOctave;
  }

  setLastOctave(octave: number): void {
    this.lastOctave = Math.min(Math.max(octave, 0), 8);
    this.patch({});
  }

  // ---- mixer ---------------------------------------------------------------

  setChannelMute(channel: number, muted: boolean): void {
    this.engine?.setChannelMute(channel, muted);
    const channelMuted = this.state.channelMuted.slice();
    channelMuted[channel] = muted;
    this.patch({ channelMuted });
  }

  toggleChannelMute(channel: number): void {
    this.setChannelMute(channel, !this.state.channelMuted[channel]);
  }

  setChannelVolume(channel: number, volume: number): void {
    const clamped = Math.min(Math.max(volume, 0), 1);
    this.engine?.setChannelVolume(channel, clamped);
    const channelVolume = this.state.channelVolume.slice();
    channelVolume[channel] = clamped;
    this.patch({ channelVolume });
  }

  setMasterVolume(volume: number): void {
    const clamped = Math.min(Math.max(volume, 0), 1);
    this.engine?.setMasterVolume(clamped);
    this.patch({ masterVolume: clamped });
  }

  setMasterFx(settings: MasterFxSettings): void {
    this.engine?.setMasterFx(settings);
    this.patch({ masterFx: settings });
  }

  /** Patches a single master-FX field from a nested editor. */
  patchMasterFx(patch: Partial<MasterFxSettings>): void {
    this.setMasterFx({ ...this.state.masterFx, ...patch });
  }

  samplerSettings(index: number): SamplerSettings | undefined {
    return this.state.settings[index];
  }

  /**
   * Merges a patch into an instrument's settings, mirroring the GUI editor:
   * source changes re-trim while driving the plain sampler, and Spectral
   * changes rebuild the fused render before the trim is re-applied.
   */
  updateSamplerSetting(index: number, patch: Partial<SamplerSettings>): void {
    const engine = this.engine;
    const settings = this.state.settings.slice();
    const current = settings[index] ?? defaultSamplerSettings();
    let merged: SamplerSettings = { ...current, ...patch };
    if (patch.sourceIndex !== undefined && !merged.spectral.enabled) {
      const duration = engine?.sampleDurations()[patch.sourceIndex ?? -1] ?? 0;
      merged = { ...merged, startSec: 0, endSec: duration };
    }
    engine?.setSamplerSettings(index, merged);
    if (
      merged.spectral.enabled &&
      (patch.spectral !== undefined || patch.sourceIndex !== undefined)
    ) {
      engine?.renderFusion(index);
      const duration = engine?.effectiveDuration(index) ?? 0;
      if (duration > 0) {
        merged = { ...merged, startSec: 0, endSec: duration };
        engine?.setSamplerSettings(index, merged);
      }
    }
    const next = this.state.settings.slice();
    next[index] = merged;
    this.patch({ settings: next, dirty: true });
  }

  /**
   * Re-renders a Spectral instrument (already triggered by the edit) and then
   * auditions it once ready — the TUI equivalent of FEAT-16's preview on slider
   * release. Plain instruments preview immediately.
   */
  async previewAfterRender(index: number, timeoutMs = 30_000): Promise<void> {
    const engine = this.engine;
    if (!engine) return;
    const settings = this.state.settings[index];
    if (!settings) return;
    if (!settings.spectral.enabled || settings.sourceIndex === null) {
      engine.preview(index, this.state.reference);
      return;
    }
    if (!engine.fusionRendering(index) && !engine.fusionReady(index)) {
      engine.renderFusion(index);
    }
    const deadline = Date.now() + timeoutMs;
    // Give the async render a moment to flip `rendering` on before polling.
    await new Promise((resolve) => setTimeout(resolve, 60));
    while (engine.fusionRendering(index) && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 40));
    }
    if (engine.fusionReady(index)) engine.preview(index, this.state.reference);
  }

  setReference(reference: boolean): void {
    this.patch({ reference });
  }

  meterLevels(): number[] {
    return this.engine?.meterLevels() ?? [0, 0, 0, 0, 0];
  }

  /** Structured snapshot for `/query` and the control channel. */
  snapshot(): Record<string, unknown> {
    const state = this.state;
    const song = state.song;
    const cursor = state.cursor;
    const column =
      song && song.channels[cursor.channel]
        ? (flatColumnsForChannel(song, cursor.channel)[cursor.column]?.kind ??
          null)
        : null;
    return {
      status: state.status,
      dirty: state.dirty,
      song: song
        ? {
            name: song.meta.name,
            author: song.meta.author,
            system: song.meta.system,
            tickRate: song.meta.tickRate,
            patternLength: song.meta.patternLength,
            orderLength: song.meta.orderLength,
            instruments: song.instruments.length,
          }
        : null,
      transport: {
        playing: state.playing,
        time: state.time,
        duration: state.duration,
        order: state.viewOrder,
      },
      tracker: {
        order: cursor.order,
        row: cursor.row,
        channel: cursor.channel,
        column,
        columnIndex: cursor.column,
        step: state.step,
        colorInstruments: state.colorInstruments,
      },
      mixer: {
        channelVolume: state.channelVolume,
        channelMuted: state.channelMuted,
        masterVolume: state.masterVolume,
        masterFx: state.masterFx,
      },
      samples: state.sampleNames,
      meters: this.meterLevels(),
    };
  }

  /** Resolves a dotted path (e.g. `transport.playing`) against the snapshot. */
  query(path: string): unknown {
    if (!path) return this.snapshot();
    let value: unknown = this.snapshot();
    for (const part of path.split(".")) {
      if (value === null || typeof value !== "object") return undefined;
      value = (value as Record<string, unknown>)[part];
    }
    return value;
  }

  /** Updates the command history cursor when recalling, exposed for tests. */
  resetHistoryCursor(): void {
    this.historyCursor = null;
  }

  sampleWaveform(source: number): Array<[number, number]> {
    return this.engine?.sampleWaveform(source) ?? [];
  }

  /** Waveform of an instrument's effective source (fused clip or raw sample). */
  effectiveWaveform(instrument: number): Array<[number, number]> {
    return this.engine?.effectiveWaveform(instrument) ?? [];
  }

  /** Waveform of an instrument's rendered Spectral fusion, when available. */
  fusionWaveform(instrument: number): Array<[number, number]> {
    return this.engine?.fusionWaveform(instrument) ?? [];
  }

  sampleDurations(): number[] {
    return this.engine?.sampleDurations() ?? [];
  }

  /** Display name for a source sample slot (empty when unset). */
  sampleName(slot: number): string {
    return this.state.sampleNames[slot] ?? "";
  }

  /** Free-text comments for a source sample slot. */
  sampleComments(slot: number): string {
    return this.state.project?.sourceSamples[slot]?.comments ?? "";
  }

  /** Persists a source sample's name/comments into the project + sample names. */
  updateSampleInfo(
    slot: number,
    patch: { name?: string; comments?: string },
  ): void {
    const sampleNames = this.state.sampleNames.slice();
    while (sampleNames.length < 6) sampleNames.push("");
    if (patch.name !== undefined) sampleNames[slot] = patch.name;
    const project = this.state.project;
    let nextProject = project;
    if (project) {
      const sourceSamples = project.sourceSamples.slice();
      while (sourceSamples.length < 6) sourceSamples.push(null);
      const existing = sourceSamples[slot];
      sourceSamples[slot] = {
        name: sampleNames[slot] ?? "",
        url: existing?.url ?? null,
        comments: patch.comments ?? existing?.comments ?? "",
        dataUrl: existing?.dataUrl ?? null,
      };
      nextProject = { ...project, sourceSamples };
    }
    this.patch({ sampleNames, project: nextProject, dirty: true });
  }

  setStatus(status: string): void {
    this.patch({ status });
  }

  setError(error: string | null): void {
    this.patch({ error });
  }

  setControlPath(controlPath: string | null): void {
    this.patch({ controlPath });
  }

  markWasmReady(): void {
    this.patch({ wasmReady: true });
  }

  setProject(project: ProjectFile): void {
    this.patch({ project });
  }

  dispose(): void {
    this.engine?.dispose();
    this.engine = null;
    this.notify();
  }
}

function snapshotColumn(
  song: SongModel,
  channel: number,
  column: EditColumn,
  order: number,
  rowLo: number,
  rowHi: number,
): PatternCell[] {
  const out: PatternCell[] = [];
  for (let row = rowLo; row <= rowHi; row++)
    out.push(cellAt(song, channel, order, row));
  return out;
}

export { defaultSamplerSettings };
export type { LastValues };
