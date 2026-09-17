import type { PlaybackMode } from "@/audio/backend";
import { WebAudioBackend } from "@/audio/webAudioBackend";
import type { NoteValue, PatternCell } from "@/core/fur/types";
import { defaultMasterFx, type MasterFxSettings } from "@/core/masterFx";
import {
  applyEdit,
  applySnapshot,
  buildSongModel,
  buildSongModelFromProject,
  cellAt,
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
import { clearValue, flatColumnsForChannel, writeValue } from "@/core/tracker";
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
  mode: PlaybackMode;
  channelVolume: number[];
  channelMuted: boolean[];
  masterVolume: number;
  masterFx: MasterFxSettings;
  reference: boolean;
  stemsAvailable: boolean;
  wasmReady: boolean;
  playing: boolean;
  time: number;
  duration: number;
  /** Order currently shown in the tracker view. */
  viewOrder: number;
  cursor: Cursor;
  dirty: boolean;
}

interface HistoryEntry {
  channel: number;
  order: number;
  row: number;
  before: PatternCell;
  after: PatternCell;
}

function initialState(): SessionState {
  return {
    status: "Starting…",
    error: null,
    song: null,
    project: null,
    settings: [],
    sampleNames: [],
    mode: "sampler",
    channelVolume: [1, 1, 1, 1],
    channelMuted: [false, false, false, false],
    masterVolume: 1,
    masterFx: defaultMasterFx(),
    reference: false,
    stemsAvailable: false,
    wasmReady: false,
    playing: false,
    time: 0,
    duration: 0,
    viewOrder: 0,
    cursor: { order: 0, channel: 0, row: 0, column: 0 },
    dirty: false,
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
  private history: HistoryEntry[] = [];
  private redoStack: HistoryEntry[] = [];
  private lastInstrument = 0;
  private lastOctave = 4;

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
    const haveStems = result.stems.some((stem) => stem && stem.length > 0);
    if (haveStems) engine.loadStems(result.stems);
    const initialMode: PlaybackMode =
      loadedProject.samplerModeEnabled || !haveStems ? "sampler" : "chip";
    engine.setMode(initialMode);
    this.engine = engine;

    this.history = [];
    this.redoStack = [];
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
      stemsAvailable: haveStems,
      mode: initialMode,
      status: `${model.meta.name} — ${model.instruments.length} instruments`,
      dirty: false,
      viewOrder: 0,
      cursor: { order: 0, channel: 0, row: 0, column: 0 },
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
    if (
      playing === this.state.playing &&
      Math.abs(time - this.state.time) < 0.001
    )
      return;
    this.patch({ playing, time });
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

  setMode(mode: PlaybackMode): void {
    this.engine?.setMode(mode);
    this.patch({ mode });
  }

  toggleMode(): void {
    this.setMode(this.state.mode === "sampler" ? "chip" : "sampler");
  }

  // ---- cursor / editing ----------------------------------------------------

  moveCursor(delta: {
    order?: number;
    channel?: number;
    row?: number;
    column?: number;
  }): void {
    const song = this.state.song;
    if (!song) return;
    const cursor = { ...this.state.cursor };
    const columns = flatColumnsForChannel(song, cursor.channel).length;
    if (delta.order) {
      cursor.order = Math.min(
        Math.max(cursor.order + delta.order, 0),
        song.meta.orderLength - 1,
      );
      this.patch({ viewOrder: cursor.order, cursor });
      return;
    }
    if (delta.channel) {
      const count = Math.min(song.channels.length, 4);
      cursor.channel = (cursor.channel + delta.channel + count) % count;
      cursor.column = Math.min(
        cursor.column,
        flatColumnsForChannel(song, cursor.channel).length - 1,
      );
      this.patch({ cursor });
      return;
    }
    if (delta.column) {
      const next = cursor.column + delta.column;
      if (next < 0 || next >= columns) return;
      cursor.column = next;
      this.patch({ cursor });
      return;
    }
    if (delta.row) {
      const patternLength = song.meta.patternLength;
      cursor.row = Math.min(
        Math.max(cursor.row + delta.row, 0),
        patternLength - 1,
      );
      this.patch({ cursor });
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
      if (patchValue.instrument === undefined && patchValue.note) {
        after = writeValue(
          after,
          { kind: "ins" },
          { kind: "ins", value: this.lastInstrument },
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
      if (patchValue.instrument !== null)
        this.lastInstrument = patchValue.instrument;
    } else if (columnDef.kind === "vol" && patchValue.volume !== undefined) {
      after = writeValue(after, columnDef, {
        kind: "vol",
        value: patchValue.volume,
      });
    } else {
      return;
    }
    this.commit({ channel, order, row, before, after });
    // Advance down like a tracker.
    this.moveCursor({ row: 1 });
  }

  clearCell(): void {
    const song = this.state.song;
    if (!song) return;
    const { channel, order, row, column } = this.state.cursor;
    const columnDef = flatColumnsForChannel(song, channel)[column];
    if (!columnDef) return;
    const before = cellAt(song, channel, order, row);
    const after = clearValue(before, columnDef);
    this.commit({ channel, order, row, before, after });
  }

  private commit(entry: HistoryEntry): void {
    const song = this.state.song;
    if (!song) return;
    applyEdit(song, {
      channel: entry.channel,
      order: entry.order,
      row: entry.row,
      cell: entry.after,
    });
    this.history.push(entry);
    this.redoStack = [];
    this.engine?.updateSequence(sequenceFromSong(song));
    this.patch({ dirty: true });
  }

  undo(): boolean {
    const entry = this.history.pop();
    const song = this.state.song;
    if (!entry || !song) return false;
    applyEdit(song, {
      channel: entry.channel,
      order: entry.order,
      row: entry.row,
      cell: entry.before,
    });
    this.redoStack.push(entry);
    this.engine?.updateSequence(sequenceFromSong(song));
    this.patch({ dirty: true });
    return true;
  }

  redo(): boolean {
    const entry = this.redoStack.pop();
    const song = this.state.song;
    if (!entry || !song) return false;
    applyEdit(song, {
      channel: entry.channel,
      order: entry.order,
      row: entry.row,
      cell: entry.after,
    });
    this.history.push(entry);
    this.engine?.updateSequence(sequenceFromSong(song));
    this.patch({ dirty: true });
    return true;
  }

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
    // Furnace raw note: 60 == C-4 here (see noteToName).
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

  setReference(reference: boolean): void {
    this.patch({ reference });
  }

  meterLevels(): number[] {
    return this.engine?.meterLevels() ?? [0, 0, 0, 0, 0];
  }

  setStatus(status: string): void {
    this.patch({ status });
  }

  setError(error: string | null): void {
    this.patch({ error });
  }

  markWasmReady(): void {
    this.patch({ wasmReady: true });
  }

  dispose(): void {
    this.engine?.dispose();
    this.engine = null;
    this.notify();
  }
}

export { defaultSamplerSettings };
