import { useCallback, useEffect, useRef, useState } from "react";
import {
  applySnapshot,
  buildSongModel,
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
import { WebAudioBackend } from "@/audio/webAudioBackend";
import type { PlaybackMode } from "@/audio/backend";
import { Transport } from "./components/Transport";
import { Mixer } from "./components/Mixer";
import { InstrumentList } from "./components/InstrumentList";
import { PatternGrid } from "./components/PatternGrid";

export function App() {
  const backendRef = useRef<WebAudioBackend | null>(null);
  const [backend, setBackend] = useState<WebAudioBackend | null>(null);
  const [song, setSong] = useState<SongModel | null>(null);
  const [project, setProject] = useState<ProjectFile | null>(null);
  const [settings, setSettings] = useState<SamplerSettings[]>([]);
  const [sampleNames, setSampleNames] = useState<string[]>([]);
  const [mode, setMode] = useState<PlaybackMode>("sampler");
  const [stemsAvailable, setStemsAvailable] = useState(false);
  const [channelVolume, setChannelVolume] = useState([1, 1, 1, 1]);
  const [channelMuted, setChannelMuted] = useState([false, false, false, false]);
  const [masterVolume, setMasterVolume] = useState(1);
  const [reference, setReference] = useState(false);
  const [status, setStatus] = useState("Loading bundled song…");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const result = await window.lantern.loadDefaultSong();
        if (cancelled) return;
        if ("error" in result && result.error) {
          setError(result.error);
          setStatus("");
          return;
        }
        if (!("raw" in result)) {
          setError("Unexpected asset-loading response");
          return;
        }

        const song = buildSongModel(result.raw);
        const project = projectFromJson(result.project);
        validateProject(project, song.instruments.length);
        if (project.patternSnapshot) applySnapshot(song, project.patternSnapshot);
        applyTimingOverrides(project, song);

        const settings = song.instruments.map(
          (_, i) => project.instruments[i] ?? defaultSamplerSettings(),
        );
        project.mutedInstruments.forEach((muted, i) => {
          if (settings[i]) settings[i]!.muted = !!muted;
        });
        const sampleNames = project.sourceSamples.map((sample) => sample?.name ?? "");
        const sampleBytes: Array<Uint8Array | null> = Array.from(
          { length: 6 },
          (_, i) => result.samples[i] ?? null,
        );

        const engine = new WebAudioBackend();
        engine.ensureStarted();
        for (let c = 0; c < 4; c++) {
          engine.setChannelVolume(c, project.channelVolume[c] ?? 1);
          engine.setChannelMute(c, project.mutedChannels[c] ?? false);
        }
        engine.setMasterVolume(project.masterVolume);
        engine.loadSampler(sequenceFromSong(song), settings, sampleBytes);
        const haveStems = result.stems.some((s) => s && s.length > 0);
        if (haveStems) engine.loadStems(result.stems);
        const initialMode: PlaybackMode =
          project.samplerModeEnabled || !haveStems ? "sampler" : "chip";
        engine.setMode(initialMode);

        if (cancelled) return;
        backendRef.current = engine;
        setBackend(engine);
        setSong(song);
        setProject(project);
        setSettings(settings);
        setSampleNames(sampleNames);
        setChannelVolume(project.channelVolume.slice(0, 4));
        setChannelMuted(project.mutedChannels.slice(0, 4));
        setMasterVolume(project.masterVolume);
        setReference(project.refPitchEnabled);
        setMode(initialMode);
        setStemsAvailable(haveStems);
        setStatus(`${song.meta.name} — ${song.instruments.length} instruments`);
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
  }, []);

  const changeMode = useCallback((next: PlaybackMode) => {
    backendRef.current?.setMode(next);
    setMode(next);
  }, []);

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
      const engine = backendRef.current;
      if (!engine) return;
      engine.ensureStarted();
      engine.preview(index, reference);
    },
    [reference],
  );

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
          <span className="mono status">{status}</span>
        </div>
      </header>

      {error && <div className="error-banner">{error}</div>}

      {song && backend && (
        <main className="layout">
          <div className="main-column">
            <Transport
              backend={backend}
              song={song}
              mode={mode}
              stemsAvailable={stemsAvailable}
              onModeChange={changeMode}
            />
            <PatternGrid song={song} backend={backend} />
            <InstrumentList
              song={song}
              settings={settings}
              sampleNames={sampleNames}
              onUpdate={onUpdateSetting}
              onPreview={onPreview}
            />
          </div>
          <aside className="sidebar">
            <Mixer
              backend={backend}
              channelVolume={channelVolume}
              channelMuted={channelMuted}
              masterVolume={masterVolume}
              onChannelVolume={onChannelVolume}
              onChannelMute={onChannelMute}
              onMasterVolume={onMasterVolume}
            />
            {project && (
              <section className="panel">
                <h2>SONG</h2>
                <p className="mono small">
                  {project.songTitle || song.meta.name}
                  {project.album ? ` — ${project.album}` : ""}
                </p>
                <p className="small muted">
                  {song.meta.system} · {song.meta.orderLength} orders ·{" "}
                  {song.meta.patternLength} rows
                </p>
              </section>
            )}
          </aside>
        </main>
      )}
    </div>
  );
}
