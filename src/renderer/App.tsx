import { useCallback, useEffect, useRef, useState } from "react";
import {
  applySnapshot,
  buildSongModel,
  cellAt,
  patternSnapshot,
  type SongModel,
} from "@/core/songModel";
import {
  applyTimingOverrides,
  projectFromJson,
  projectToJson,
  projectToValue,
  validateProject,
  type ProjectFile,
} from "@/core/project";
import {
  defaultSamplerSettings,
  sequenceFromSong,
  type SamplerSettings,
} from "@/core/sampler";
import { renderSamplerMix, wavPcm16, zipStore } from "@/core/export";
import { writeMidi } from "@/core/midi";
import { samplerPlaybackRate } from "@/core/pitch";
import { rowDuration, rowTime } from "@/core/timing";
import { WebAudioBackend } from "@/audio/webAudioBackend";
import type { PlaybackMode } from "@/audio/backend";
import { applyTheme, loadTheme, type ThemeName } from "./theme";
import { safeFilename } from "./util";
import { Toolbar } from "./components/Toolbar";
import { Transport } from "./components/Transport";
import { Mixer } from "./components/Mixer";
import { InstrumentList } from "./components/InstrumentList";
import { PatternGrid } from "./components/PatternGrid";
import { SourceSamples } from "./components/SourceSamples";
import { Piano } from "./components/Piano";
import { CoverArt } from "./components/CoverArt";
import { SamplerEditor } from "./components/SamplerEditor";
import { initPrismWasm } from "./vendor/prism/loader";

interface EditorState {
  index: number;
  spectral: boolean;
}

export function App() {
  const backendRef = useRef<WebAudioBackend | null>(null);
  const songRef = useRef<SongModel | null>(null);
  const settingsRef = useRef<SamplerSettings[]>([]);
  const [backend, setBackend] = useState<WebAudioBackend | null>(null);
  const [song, setSong] = useState<SongModel | null>(null);
  const [project, setProject] = useState<ProjectFile | null>(null);
  const [settings, setSettings] = useState<SamplerSettings[]>([]);
  const [sampleNames, setSampleNames] = useState<string[]>([]);
  const [mode, setMode] = useState<PlaybackMode>("sampler");
  const [editMode, setEditMode] = useState(false);
  const [stemsAvailable, setStemsAvailable] = useState(false);
  const [channelVolume, setChannelVolume] = useState([1, 1, 1, 1]);
  const [channelMuted, setChannelMuted] = useState([false, false, false, false]);
  const [masterVolume, setMasterVolume] = useState(1);
  const [reference, setReference] = useState(false);
  const [theme, setTheme] = useState<ThemeName>(() => loadTheme());
  const [status, setStatus] = useState("Loading bundled song…");
  const [error, setError] = useState<string | null>(null);

  const [currentFur, setCurrentFur] = useState<Uint8Array | null>(null);
  const [chipMix, setChipMix] = useState<Uint8Array | null>(null);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [projectIoOpen, setProjectIoOpen] = useState(false);
  const [projectIoText, setProjectIoText] = useState("");
  const [sampleInfo, setSampleInfo] = useState<number | null>(null);
  const [sampleInfoName, setSampleInfoName] = useState("");
  const [sampleInfoComments, setSampleInfoComments] = useState("");
  const [clearConfirm, setClearConfirm] = useState(false);
  const [wasmReady, setWasmReady] = useState(false);

  songRef.current = song;
  settingsRef.current = settings;

  useEffect(() => {
    let cancelled = false;
    void initPrismWasm().then((ready) => {
      if (!cancelled) setWasmReady(ready);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (
        target &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT")
      ) {
        return;
      }
      if (event.code !== "Space") return;
      const engine = backendRef.current;
      if (!engine) return;
      event.preventDefault();
      if (event.ctrlKey) {
        engine.ensureStarted();
        if (!engine.isPlaying()) engine.play(engine.currentTime());
        return;
      }
      if (engine.isPlaying()) engine.pause();
      else {
        engine.ensureStarted();
        engine.play(engine.currentTime());
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const applyLoaded = useCallback((result: Awaited<ReturnType<typeof window.lantern.loadDefaultSong>>) => {
    if ("error" in result && result.error) {
      setError(result.error);
      setStatus("");
      return;
    }
    if (!("raw" in result)) return;

    const model = buildSongModel(result.raw);
    const loadedProject = projectFromJson(result.project);
    validateProject(loadedProject, model.instruments.length);
    if (loadedProject.patternSnapshot) applySnapshot(model, loadedProject.patternSnapshot);
    applyTimingOverrides(loadedProject, model);

    const loadedSettings = model.instruments.map(
      (_, i) => loadedProject.instruments[i] ?? defaultSamplerSettings(),
    );
    loadedProject.mutedInstruments.forEach((muted, i) => {
      if (loadedSettings[i]) loadedSettings[i]!.muted = !!muted;
    });

    const engine = new WebAudioBackend();
    engine.ensureStarted();
    for (let c = 0; c < 4; c++) {
      engine.setChannelVolume(c, loadedProject.channelVolume[c] ?? 1);
      engine.setChannelMute(c, loadedProject.mutedChannels[c] ?? false);
    }
    engine.setMasterVolume(loadedProject.masterVolume);
    const sampleBytes: Array<Uint8Array | null> = Array.from(
      { length: 6 },
      (_, i) => result.samples[i] ?? null,
    );
    engine.loadSampler(sequenceFromSong(model), loadedSettings, sampleBytes);
    const haveStems = result.stems.some((s) => s && s.length > 0);
    if (haveStems) engine.loadStems(result.stems);
    const initialMode: PlaybackMode =
      loadedProject.samplerModeEnabled || !haveStems ? "sampler" : "chip";
    engine.setMode(initialMode);

    const names = loadedProject.sourceSamples.map((s) => s?.name ?? "");
    setBackend(engine);
    backendRef.current = engine;
    setSong(model);
    setProject(loadedProject);
    setSettings(loadedSettings);
    setSampleNames(names);
    setChannelVolume(loadedProject.channelVolume.slice(0, 4));
    setChannelMuted(loadedProject.mutedChannels.slice(0, 4));
    setMasterVolume(loadedProject.masterVolume);
    setReference(loadedProject.refPitchEnabled);
    setMode(initialMode);
    setStemsAvailable(haveStems);
    setCurrentFur(result.furBytes);
    setChipMix(result.chipMix ?? null);
    setEditor(null);
    setStatus(`${model.meta.name} — ${model.instruments.length} instruments`);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const result = await window.lantern.loadDefaultSong();
        if (!cancelled) applyLoaded(result);
      } catch (e) {
        if (!cancelled) {
          setError(String(e));
          setStatus("");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [applyLoaded]);

  const changeMode = useCallback((next: PlaybackMode) => {
    backendRef.current?.setMode(next);
    setMode(next);
    setEditMode(false);
  }, []);

  const toggleEdit = useCallback(() => {
    setMode("sampler");
    backendRef.current?.setMode("sampler");
    setEditMode((prev) => !prev);
  }, []);

  const onPatternChanged = useCallback(() => {
    const model = songRef.current;
    if (model) backendRef.current?.updateSequence(sequenceFromSong(model));
  }, []);

  const onSeek = useCallback((time: number) => {
    backendRef.current?.seek(time);
  }, []);

  const onToggleChannel = useCallback((channel: number) => {
    setChannelMuted((prev) => {
      const next = prev.slice();
      next[channel] = !next[channel];
      backendRef.current?.setChannelMute(channel, next[channel]!);
      return next;
    });
  }, []);

  const onAudition = useCallback(
    (channels: number[], order: number, row: number) => {
      const model = songRef.current;
      const engine = backendRef.current;
      if (!model || !engine) return;
      const notes: Array<{ channel: number; instrument: number; rate: number; volume: number }> = [];
      for (const channel of channels) {
        const ch = model.channels[channel];
        if (!ch) continue;
        const note = ch.noteTimeline[order]?.[row];
        const instrument = ch.insTimeline[order]?.[row] ?? null;
        if (!note || instrument === null) continue;
        const setting = settingsRef.current[instrument];
        if (setting?.muted) continue;
        const rate = samplerPlaybackRate(note, model.meta.tuningA4, 0);
        if (rate === null || !(rate > 0)) continue;
        const cell = cellAt(model, channel, order, row);
        notes.push({
          channel,
          instrument,
          rate,
          volume: Math.min(cell.volume ?? 15, 15) / 15,
        });
      }
      if (notes.length === 0) return;
      engine.ensureStarted();
      engine.previewPattern(channels, rowTime(model, order, row), rowDuration(model, order * model.meta.patternLength + row) * 2, notes);
    },
    [],
  );

  const onChannelVolume = useCallback((channel: number, volume: number) => {
    backendRef.current?.setChannelVolume(channel, volume);
    setChannelVolume((prev) => {
      const next = prev.slice();
      next[channel] = volume;
      return next;
    });
  }, []);

  const onChannelMute = useCallback((channel: number, muted: boolean) => {
    backendRef.current?.setChannelMute(channel, muted);
    setChannelMuted((prev) => {
      const next = prev.slice();
      next[channel] = muted;
      return next;
    });
  }, []);

  const onMasterVolume = useCallback((volume: number) => {
    backendRef.current?.setMasterVolume(volume);
    setMasterVolume(volume);
  }, []);

  const onUpdateSetting = useCallback((index: number, patch: Partial<SamplerSettings>) => {
    const engine = backendRef.current;
    setSettings((prev) => {
      const next = prev.slice();
      const current = next[index] ?? defaultSamplerSettings();
      let merged: SamplerSettings = { ...current, ...patch };
      if (patch.sourceIndex !== undefined) {
        const duration = engine?.sampleDurations()[patch.sourceIndex ?? -1] ?? 0;
        merged = { ...merged, startSec: 0, endSec: duration };
      }
      next[index] = merged;
      engine?.setSamplerSettings(index, merged);
      return next;
    });
  }, []);

  const onPreview = useCallback(
    (index: number) => {
      backendRef.current?.ensureStarted();
      backendRef.current?.preview(index, reference);
    },
    [reference],
  );

  const loadSample = useCallback(
    async (slot: number) => {
      const choice = await window.lantern.chooseAudioFile();
      if ("error" in choice) {
        if (choice.error !== "cancelled") setError(choice.error);
        return;
      }
      backendRef.current?.replaceSample(slot, choice.bytes);
      setSampleNames((prev) => {
        const next = prev.slice();
        while (next.length < 6) next.push("");
        next[slot] = choice.name;
        return next;
      });
      setProject((prev) => {
        if (!prev) return prev;
        const sourceSamples = prev.sourceSamples.slice();
        while (sourceSamples.length < 6) sourceSamples.push(null);
        sourceSamples[slot] = { name: choice.name, url: null, comments: "", dataUrl: null };
        return { ...prev, sourceSamples };
      });
      setStatus(`Loaded Source Sample slot ${slot}`);
    },
    [],
  );

  const clearSamples = useCallback(() => {
    const engine = backendRef.current;
    if (!engine) return;
    engine.stopSamplePreview();
    for (let slot = 0; slot < 6; slot++) engine.replaceSample(slot, null);
    setSampleNames(Array.from({ length: 6 }, () => ""));
    setProject((prev) => (prev ? { ...prev, sourceSamples: Array.from({ length: 6 }, () => null) } : prev));
    setSettings((prev) =>
      prev.map((s) => ({ ...s, sourceIndex: null, startSec: 0, endSec: 0 })),
    );
    setClearConfirm(false);
    setStatus("Cleared source samples");
  }, []);

  const openProjectJson = useCallback(() => {
    if (!song || !project) return;
    const live: ProjectFile = {
      ...project,
      samplerModeEnabled: mode === "sampler",
      channelVolume,
      masterVolume,
      mutedChannels: channelMuted,
      mutedInstruments: settings.map((s) => s.muted),
      refPitchEnabled: reference,
      theme,
      instruments: settings.map((s) => ({ ...s, muted: false })),
      patternSnapshot: patternSnapshot(song),
      tickRateOverride: song.meta.tickRate,
      speedOverride: song.meta.speedPattern[0] ?? null,
      highlightAOverride: song.meta.highlightA,
      highlightBOverride: song.meta.highlightB,
      virtualTempoOverride: song.meta.virtualTempo,
    };
    setProjectIoText(projectToJson(live, true));
    setProjectIoOpen(true);
  }, [song, project, mode, channelVolume, masterVolume, channelMuted, settings, reference, theme]);

  const applyProjectText = useCallback(() => {
    if (!song) return;
    try {
      const parsed = projectFromJson(projectIoText);
      validateProject(parsed, song.instruments.length);
      if (parsed.patternSnapshot) applySnapshot(song, parsed.patternSnapshot);
      applyTimingOverrides(parsed, song);
      const engine = backendRef.current;
      for (let c = 0; c < 4; c++) {
        engine?.setChannelVolume(c, parsed.channelVolume[c] ?? 1);
        engine?.setChannelMute(c, parsed.mutedChannels[c] ?? false);
      }
      engine?.setMasterVolume(parsed.masterVolume);
      const nextSettings = song.instruments.map(
        (_, i) => parsed.instruments[i] ?? defaultSamplerSettings(),
      );
      parsed.mutedInstruments.forEach((muted, i) => {
        if (nextSettings[i]) nextSettings[i]!.muted = !!muted;
      });
      nextSettings.forEach((s, i) => engine?.setSamplerSettings(i, s));
      engine?.updateSequence(sequenceFromSong(song));
      setSettings(nextSettings);
      setProject(parsed);
      setSampleNames(parsed.sourceSamples.map((s) => s?.name ?? ""));
      setChannelVolume(parsed.channelVolume.slice(0, 4));
      setChannelMuted(parsed.mutedChannels.slice(0, 4));
      setMasterVolume(parsed.masterVolume);
      setReference(parsed.refPitchEnabled);
      setProjectIoOpen(false);
      setStatus("Applied Project JSON");
    } catch (e) {
      setError(String(e));
    }
  }, [song, projectIoText]);

  const saveBytes = useCallback(async (name: string, bytes: Uint8Array) => {
    const ok = await window.lantern.saveFile(name, bytes);
    if (ok) setStatus(`Saved ${name}`);
  }, []);

  const saveFur = useCallback(() => {
    if (currentFur && song) void saveBytes(`${safeFilename(song.meta.name)}.fur`, currentFur);
  }, [currentFur, song, saveBytes]);

  const saveMidi = useCallback(() => {
    if (song) void saveBytes(`${safeFilename(song.meta.name)}.mid`, writeMidi(song));
  }, [song, saveBytes]);

  const saveWav = useCallback(() => {
    if (!song) return;
    if (mode === "chip" && chipMix) {
      void saveBytes(`${safeFilename(song.meta.name)}.wav`, chipMix);
      return;
    }
    const engine = backendRef.current;
    if (!engine) return;
    const clips = settings.map((_, i) => engine.effectiveClip(i));
    const mix = renderSamplerMix(
      sequenceFromSong(song),
      settings,
      clips,
      channelVolume,
      channelMuted,
      masterVolume,
    );
    void saveBytes(`${safeFilename(project?.songTitle || song.meta.name)}-sampler-mix.wav`, wavPcm16(mix));
  }, [song, mode, chipMix, settings, channelVolume, channelMuted, masterVolume, project, saveBytes]);

  const packageSamples = useCallback(() => {
    const engine = backendRef.current;
    if (!engine) return;
    const entries: Array<{ name: string; data: Uint8Array }> = [];
    for (let slot = 0; slot < 6; slot++) {
      if (!project?.sourceSamples[slot]) continue;
      const clip = engine.sampleClip(slot);
      if (clip) entries.push({ name: `${slot}.wav`, data: wavPcm16(clip) });
    }
    if (entries.length === 0) {
      setError("No decoded Source Samples are available to package");
      return;
    }
    const title = project?.songTitle || song?.meta.name || "lantern";
    void saveBytes(`${safeFilename(title)}-source-samples.zip`, zipStore(entries));
  }, [project, song, saveBytes]);

  const loadFolder = useCallback(async () => {
    const result = await window.lantern.loadSongFolder();
    if ("error" in result) {
      if (result.error !== "cancelled") setError(result.error || "Failed to load folder");
      return;
    }
    backendRef.current?.dispose();
    setStatus("Loading selected song folder…");
    setError(null);
    applyLoaded(result);
  }, [applyLoaded]);

  const openEditor = useCallback((index: number, spectral: boolean) => {
    setEditor({ index, spectral });
  }, []);

  const infoProject = project;

  return (
    <div className="app">
      <header className="app-header">
        <div>
          <h1>Lantern Music Player</h1>
          {song && (
            <p className="subtitle">
              {song.meta.name} — {song.meta.author}
            </p>
          )}
        </div>
        <div className="header-right">
          <label className="ref-toggle">
            <input
              type="checkbox"
              checked={reference}
              onChange={(e) => setReference(e.target.checked)}
            />
            Ref Pitch
          </label>
          <button
            className="theme-toggle"
            onClick={() => setTheme((t) => (t === "light" ? "dark" : "light"))}
            title="Toggle Light / Dark theme"
          >
            {theme === "light" ? "☀ Light" : "☾ Dark"}
          </button>
        </div>
      </header>

      {error && (
        <div className="error-banner" onClick={() => setError(null)} title="Dismiss">
          {error}
        </div>
      )}

      {song && backend && (
        <main className="layout">
          <div className="main-column">
            <Toolbar
              onLoadFolder={() => void loadFolder()}
              onSaveFur={saveFur}
              onSaveMidi={saveMidi}
              onOpenProjectJson={openProjectJson}
              onPackageSamples={packageSamples}
              onSaveWav={saveWav}
              wavReady={mode === "sampler" || chipMix !== null}
              status={status}
            />
            <Transport
              backend={backend}
              song={song}
              mode={mode}
              stemsAvailable={stemsAvailable}
              editMode={editMode}
              onModeChange={changeMode}
              onToggleEdit={toggleEdit}
            />
            <PatternGrid
              song={song}
              backend={backend}
              editMode={editMode}
              channelMuted={channelMuted}
              instrumentMuted={settings.map((s) => s.muted)}
              onChanged={onPatternChanged}
              onSeek={onSeek}
              onToggleChannel={onToggleChannel}
              onAudition={onAudition}
            />
            <InstrumentList
              song={song}
              settings={settings}
              sampleNames={sampleNames}
              onUpdate={onUpdateSetting}
              onPreview={onPreview}
              onOpenEditor={openEditor}
            />
            <Piano song={song} backend={backend} />
            <SourceSamples
              backend={backend}
              song={song}
              project={project}
              sampleNames={sampleNames}
              onLoad={(slot) => void loadSample(slot)}
              onPlay={(slot) => backend.previewSample(slot)}
              onStop={() => backend.stopSamplePreview()}
              onInfo={(slot) => {
                setSampleInfo(slot);
                setSampleInfoName(sampleNames[slot] ?? "");
                setSampleInfoComments(infoProject?.sourceSamples[slot]?.comments ?? "");
              }}
              onClear={() => setClearConfirm(true)}
              onPackage={packageSamples}
            />
          </div>
          <aside className="sidebar">
            <CoverArt song={song} backend={backend} title={project?.songTitle || song.meta.name} />
            <Mixer
              backend={backend}
              channelVolume={channelVolume}
              channelMuted={channelMuted}
              masterVolume={masterVolume}
              onChannelVolume={onChannelVolume}
              onChannelMute={onChannelMute}
              onMasterVolume={onMasterVolume}
            />
            <section className="panel">
              <h2>SONG</h2>
              <p className="mono small">
                {project?.songTitle || song.meta.name}
                {project?.album ? ` — ${project.album}` : ""}
              </p>
              <p className="small muted">
                {song.meta.system} · {song.meta.orderLength} orders · {song.meta.patternLength} rows
              </p>
              {project?.comments && <p className="small">{project.comments}</p>}
            </section>
          </aside>
        </main>
      )}

      {editor && song && settings[editor.index] && (
        <SamplerEditor
          backend={backend!}
          index={editor.index}
          name={song.instruments[editor.index]?.name ?? `Instrument ${editor.index}`}
          color={song.instruments[editor.index]?.colorRgb ?? [201, 151, 58]}
          settings={settings[editor.index]!}
          sampleNames={sampleNames}
          reference={reference}
          onReferenceChange={setReference}
          spectralTab={editor.spectral}
          wasmAvailable={wasmReady}
          onTabChange={(spectral) => setEditor({ ...editor, spectral })}
          onUpdate={(patch) => onUpdateSetting(editor.index, patch)}
          onClose={() => setEditor(null)}
        />
      )}

      {projectIoOpen && (
        <div className="modal-backdrop" onClick={() => setProjectIoOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">
              <span>Project JSON</span>
              <button onClick={() => setProjectIoOpen(false)}>✕</button>
            </div>
            <textarea
              className="project-json"
              value={projectIoText}
              onChange={(e) => setProjectIoText(e.target.value)}
              spellCheck={false}
            />
            <div className="row">
              <button onClick={() => void navigator.clipboard.writeText(projectIoText)}>Copy</button>
              <button onClick={applyProjectText}>Apply</button>
              <button
                onClick={() =>
                  void saveBytes(
                    `${safeFilename(project?.songTitle || song?.meta.name || "project")}.json`,
                    new TextEncoder().encode(projectIoText),
                  )
                }
              >
                Download
              </button>
            </div>
          </div>
        </div>
      )}

      {sampleInfo !== null && (
        <div className="modal-backdrop" onClick={() => setSampleInfo(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">
              <span>Source Sample {sampleInfo}</span>
              <button onClick={() => setSampleInfo(null)}>✕</button>
            </div>
            <label>Name</label>
            <input value={sampleInfoName} onChange={(e) => setSampleInfoName(e.target.value)} />
            <label>Comments</label>
            <textarea
              value={sampleInfoComments}
              onChange={(e) => setSampleInfoComments(e.target.value)}
            />
            <div className="row">
              <button
                onClick={() => {
                  setSampleNames((prev) => {
                    const next = prev.slice();
                    while (next.length < 6) next.push("");
                    next[sampleInfo] = sampleInfoName;
                    return next;
                  });
                  setProject((prev) => {
                    if (!prev) return prev;
                    const sourceSamples = prev.sourceSamples.slice();
                    while (sourceSamples.length < 6) sourceSamples.push(null);
                    const existing = sourceSamples[sampleInfo];
                    sourceSamples[sampleInfo] = {
                      name: sampleInfoName,
                      url: existing?.url ?? null,
                      comments: sampleInfoComments,
                      dataUrl: existing?.dataUrl ?? null,
                    };
                    return { ...prev, sourceSamples };
                  });
                  setSampleInfo(null);
                }}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {clearConfirm && (
        <div className="modal-backdrop" onClick={() => setClearConfirm(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">
              <span>Clear Source Samples?</span>
            </div>
            <p>Remove all six loaded source samples from this session? Files on disk are not deleted.</p>
            <div className="row">
              <button onClick={clearSamples}>Clear Samples</button>
              <button onClick={() => setClearConfirm(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
