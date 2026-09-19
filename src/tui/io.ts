import { clipLen, clipSlice, type AudioClip } from "@/core/dsp";
import {
  arrangeForExport,
  applyExportEnvelope,
  renderSamplerMix,
  wavPcm16,
  zipStore,
} from "@/core/export";
import { writeMidi } from "@/core/midi";
import { defaultProject, projectFromJson, projectToJson } from "@/core/project";
import type { ProjectFile } from "@/core/project";
import {
  defaultSamplerSettings,
  sequenceDuration,
  sequenceFromSong,
} from "@/core/sampler";
import { spectralRenderEnabled, spectralWasmAvailable } from "@/core/spectral";
import { applyMasterFxOffline } from "@/audio/offline";
import { coverPngBytes } from "@/runtime/cover";
import {
  alternateProjectPath,
  basenameNoExt,
  extensionOf,
  isProjectPath,
} from "@/runtime/paths";
import type { Host } from "@/host";
import type { LoadedSong } from "@/shared/types";
import { buildSteps } from "@/core/stepthrough";
import type { Session } from "./session";

export interface IoResult {
  ok: boolean;
  message?: string;
  error?: string;
  path?: string;
}

/** Base64 helpers that work in both Node (16+) and the browser. */
function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

async function bundledSamples(host: Host): Promise<{
  bytes: Array<Uint8Array | null>;
  names: string[];
}> {
  const samples = await host.assets.listSourceSamples();
  return {
    bytes: samples.map((sample) => sample.bytes),
    // New projects name each slot from its file (e.g. "kick.ogg" -> "kick").
    names: samples.map((sample) =>
      sample.present ? basenameNoExt(sample.path) : "",
    ),
  };
}

/** Fills empty source-sample names from the bundled asset filenames. */
function withSampleNames(project: ProjectFile, names: string[]): ProjectFile {
  const sourceSamples = project.sourceSamples.slice();
  while (sourceSamples.length < 6) sourceSamples.push(null);
  for (let i = 0; i < 6; i++) {
    const name = names[i] ?? "";
    if (!name || sourceSamples[i]?.name) continue;
    const existing = sourceSamples[i];
    sourceSamples[i] = {
      name,
      url: existing?.url ?? null,
      comments: existing?.comments ?? "",
      dataUrl: existing?.dataUrl ?? null,
    };
  }
  return { ...project, sourceSamples };
}

function decodeDataUrl(dataUrl: string): Uint8Array | null {
  const comma = dataUrl.indexOf(",");
  if (comma < 0) return null;
  try {
    return base64ToBytes(dataUrl.slice(comma + 1));
  } catch {
    return null;
  }
}

/** Builds a LoadedSong from project JSON, using embedded samples or bundled ones. */
export async function loadedSongFromProjectText(
  text: string,
  host: Host,
): Promise<LoadedSong> {
  const project = projectFromJson(text);
  const embedded = project.sourceSamples.map((sample) =>
    sample?.dataUrl ? decodeDataUrl(sample.dataUrl) : null,
  );
  const samples = embedded.some(Boolean)
    ? embedded
    : (await bundledSamples(host)).bytes;
  return {
    project: text,
    samples,
  };
}

/** Opens a `.sptproj` project (legacy `.lampjson` still accepted). */
export async function openPath(
  session: Session,
  filePath: string,
): Promise<IoResult> {
  if (!isProjectPath(filePath)) {
    return {
      ok: false,
      error: `Unsupported file "${filePath}" (expected .sptproj)`,
    };
  }
  // Follow a renamed project across the .lampjson → .sptproj migration.
  let target = filePath;
  let text = await session.host.fs.readTextSafe(target);
  if (!text.ok) {
    const alternate = alternateProjectPath(filePath);
    if (alternate && alternate !== filePath) {
      const alternateText = await session.host.fs.readTextSafe(alternate);
      if (alternateText.ok) {
        target = alternate;
        text = alternateText;
      }
    }
  }
  if (!text.ok) return { ok: false, error: text.error };
  try {
    const loaded = await loadedSongFromProjectText(text.value, session.host);
    await session.load(loaded);
    session.setProjectPath(target);
    await session.host.config.recordLastProject(target);
    return { ok: true, message: `Opened ${target}`, path: target };
  } catch (error) {
    return { ok: false, error: `Cannot parse project: ${String(error)}` };
  }
}

/** Writes the project's stepthrough recipe as JSON for automation. */
export async function exportStepRecipe(
  session: Session,
  filePath: string,
): Promise<IoResult> {
  const target = session.snapshotTarget();
  if (!target) return { ok: false, error: "No project loaded" };
  const steps = buildSteps(target);
  const payload = JSON.stringify(
    { version: 1, generated: new Date().toISOString(), steps },
    null,
    2,
  );
  const result = await session.host.fs.writeBytesSafe(
    filePath,
    new TextEncoder().encode(payload),
  );
  return result.ok
    ? {
        ok: true,
        message: `Exported ${steps.length} steps to ${filePath}`,
        path: filePath,
      }
    : { ok: false, error: result.error };
}

/** Starts a fresh song from the default project. */
export async function newProject(session: Session): Promise<IoResult> {
  try {
    const project = defaultProject();
    project.songTitle = "New Song";
    project.artist = "Unknown Artist";
    project.instruments = [defaultSamplerSettings()];
    project.instrumentNames = ["Instrument 01"];
    const bundled = await bundledSamples(session.host);
    const namedProject = withSampleNames(project, bundled.names);
    await session.load({
      project: projectToJson(namedProject),
      samples: bundled.bytes,
    });
    return { ok: true, message: "New project" };
  } catch (error) {
    return { ok: false, error: String(error) };
  }
}

export async function saveProject(
  session: Session,
  filePath: string,
): Promise<IoResult> {
  // Build from the live state so edited patterns and instrument settings are
  // captured (the stored `project` object is the pre-edit baseline).
  const project = session.buildProjectFile();
  if (!project) return { ok: false, error: "No project loaded" };
  const json = projectToJson(project, true);
  const written = await session.host.fs.writeBytesSafe(
    filePath,
    new TextEncoder().encode(json),
  );
  if (!written.ok) return { ok: false, error: written.error };
  session.setProject(project);
  session.setStatus(`Saved ${written.value}`);
  session.setProjectPath(written.value);
  await session.host.config.recordLastProject(written.value);
  return { ok: true, message: `Saved ${written.value}`, path: written.value };
}

/** Audio extensions accepted by {@link importSample} (no leading dot). */
const IMPORTABLE_AUDIO = ["wav", "ogg", "mp3", "flac", "m4a", "aac"];

/** MIME hint stored alongside the embedded data (informational only). */
function audioMime(extension: string): string {
  switch (extension) {
    case "wav":
      return "audio/wav";
    case "ogg":
      return "audio/ogg";
    case "mp3":
      return "audio/mpeg";
    case "flac":
      return "audio/flac";
    case "m4a":
      return "audio/mp4";
    case "aac":
      return "audio/aac";
    default:
      return "application/octet-stream";
  }
}

/**
 * Imports an audio file into a source-sample slot. The bytes are embedded as a
 * data URL so the saved project stays self-contained, and handed to the backend
 * so the slot plays immediately (FEAT-99).
 */
export async function importSample(
  session: Session,
  slot: number,
  filePath: string,
): Promise<IoResult> {
  if (!Number.isInteger(slot) || slot < 0 || slot > 5) {
    return { ok: false, error: "Sample slot must be an integer 0–5" };
  }
  const extension = extensionOf(filePath).toLowerCase();
  if (!IMPORTABLE_AUDIO.includes(extension)) {
    return {
      ok: false,
      error: `Unsupported audio "${extension || "?"}" (use wav/ogg/mp3/flac)`,
    };
  }
  const read = await session.host.fs.readBytesSafe(filePath);
  if (!read.ok) return { ok: false, error: read.error };
  if (read.value.length === 0) {
    return { ok: false, error: `${filePath} is empty` };
  }
  const dataUrl = `data:${audioMime(extension)};base64,${bytesToBase64(read.value)}`;
  session.setSampleData(slot, {
    name: basenameNoExt(filePath),
    dataUrl,
    bytes: read.value,
  });
  return {
    ok: true,
    message: `Imported ${basenameNoExt(filePath)} into sample slot ${slot}`,
    path: filePath,
  };
}

export interface WavExportOptions {
  loops?: number;
  fadeInMs?: number;
  fadeOutMs?: number;
  normalize?: boolean;
  /** Cap the one-pass length in seconds (0/undefined = full song loop). */
  lengthSeconds?: number;
}

/**
 * Hard ceiling for an export with no explicit track length. A true-polymeter
 * Cycles loop can be hours long (the LCM of independent channel cycles), and
 * rendering that allocates gigabytes and freezes the app. The Track length
 * control (Cycles Mode) can request anything up to the song loop; only the
 * automatic/full export is bounded.
 */
export const MAX_WAV_SECONDS = 300;

/**
 * Resolves the export length (FEAT-158/BUG-37): an explicit Track length wins;
 * otherwise the full song loop is used unless it exceeds {@link MAX_WAV_SECONDS},
 * in which case it is auto-capped and flagged.
 */
export function effectiveWavLength(
  requestedSeconds: number,
  songSeconds: number,
): { lengthSeconds: number; autoCapped: boolean } {
  if (requestedSeconds > 0)
    return { lengthSeconds: requestedSeconds, autoCapped: false };
  if (songSeconds > MAX_WAV_SECONDS)
    return { lengthSeconds: MAX_WAV_SECONDS, autoCapped: true };
  return { lengthSeconds: 0, autoCapped: false };
}

/** Waits for spectral fusion renders so the export uses the fused clips. */
/**
 * Waits for in-flight Spectral/Percussion renders before an export (FEAT-156).
 *
 * Previously this waited on "not ready" alone, so when the Prism WASM was
 * unavailable (or a render failed) it stalled for the full 30 s and looked
 * frozen on "Preparing instruments". It now skips entirely without WASM, waits
 * only while renders are actually in progress (after a short grace for them to
 * start), and reports progress so the modal keeps moving.
 */
async function waitForFusion(
  session: Session,
  onProgress?: (label: string) => void,
): Promise<void> {
  const engine = session.backend;
  if (!engine) return;
  if (!spectralWasmAvailable()) return;
  const { settings } = session.getState();
  const relevant = settings
    .map((setting, index) => ({ setting, index }))
    .filter(
      ({ setting }) =>
        spectralRenderEnabled(setting.spectral) && setting.sourceIndex !== null,
    )
    .map(({ index }) => index);
  if (relevant.length === 0) return;

  const deadline = Date.now() + 30_000;
  const graceUntil = Date.now() + 1500;
  while (Date.now() < deadline) {
    // Wait for renders that are actually in flight, even when an older clip is
    // still ready (re-renders are non-destructive, so `fusionReady` can be true
    // while a newer render is running).
    const rendering = relevant.filter((i) => engine.fusionRendering(i));
    if (rendering.length === 0) {
      const notReady = relevant.filter((i) => !engine.fusionReady(i));
      // Nothing is rendering and the grace period has passed: the render
      // failed or was never scheduled, so do not wait on it.
      if (notReady.length === 0 || Date.now() > graceUntil) return;
    }
    onProgress?.(
      `Rendering Spectral instruments (${relevant.length - rendering.length}/${relevant.length})`,
    );
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  onProgress?.("Spectral render timed out — exporting available audio");
}

export async function exportWav(
  session: Session,
  filePath: string,
  options: WavExportOptions = {},
  onProgress?: (fraction: number, label?: string) => void,
): Promise<IoResult> {
  const state = session.getState();
  const {
    song,
    settings,
    project,
    masterFx,
    channelVolume,
    channelMuted,
    masterVolume,
  } = state;
  const engine = session.backend;
  if (!song || !engine) return { ok: false, error: "No song loaded" };

  // Report coarse stage progress and let Ink paint the "Exporting…" modal
  // before each CPU-bound stage (FEAT-156). The FX render feeds finer-grained
  // progress through its own callback.
  const report = (fraction: number, label?: string) =>
    onProgress?.(Math.min(Math.max(fraction, 0), 1), label);
  const paint = () => new Promise((resolve) => setTimeout(resolve, 0));

  const params = {
    loops: Math.max(0, Math.floor(options.loops ?? 0)),
    fadeInMs: options.fadeInMs ?? 0,
    fadeOutMs: options.fadeOutMs ?? 0,
    normalize: options.normalize ?? false,
    lengthSeconds: options.lengthSeconds ?? 0,
  };

  report(0.02, "Preparing instruments");
  await paint();
  await waitForFusion(session, (label) => report(0.02, label));

  report(0.06, "Rendering sampler mix");
  await paint();
  const clips: Array<AudioClip | null> = settings.map((_, i) =>
    engine.effectiveClip(i),
  );
  const sequence = sequenceFromSong(song, settings);
  const songSeconds = sequenceDuration(sequence);
  // Safety ceiling (BUG-37): a true-polymeter Cycles loop can be hours long, so
  // an export with no explicit track length is capped instead of allocating
  // gigabytes. An explicit Track length is honoured up to the song loop.
  const { lengthSeconds: effectiveLength, autoCapped } = effectiveWavLength(
    params.lengthSeconds,
    songSeconds,
  );
  const exportParams =
    effectiveLength > 0
      ? { ...params, lengthSeconds: effectiveLength }
      : params;
  if (autoCapped) {
    report(
      0.06,
      `Song loop is ${Math.round(songSeconds)}s — rendering the first ${MAX_WAV_SECONDS}s`,
    );
    await paint();
  }
  const base = renderSamplerMix(
    sequence,
    settings,
    clips,
    channelVolume,
    channelMuted,
    masterVolume,
    effectiveLength,
  );

  // A Cycles loop can be very long; an explicit length caps one pass before
  // the loop/arrange and envelope stages.
  const countLimited = effectiveLength > 0;
  const source = countLimited
    ? clipSlice(base, Math.round(effectiveLength * base.sampleRate))
    : base;

  report(0.14, "Arranging loops and fades");
  await paint();
  // Cycles track-length mode (FEAT-157): the fade-out belongs to the final ms
  // of the requested length. `arrangeForExport` fills the track by continuing
  // (repeating) the pattern with no appended fade pass, and we trim to the
  // exact length below; `applyExportEnvelope` then fades the last `fadeOutMs`
  // (e.g. start at 21 s for 25 s + 4 s).
  const arranged = arrangeForExport(source, exportParams);

  report(0.18, "Applying master FX");
  await paint();
  const wet = await applyMasterFxOffline(arranged, masterFx, (fraction) =>
    report(0.18 + fraction * 0.6, "Applying master FX"),
  );
  const keepFrames = countLimited
    ? Math.min(clipLen(wet), Math.round(effectiveLength * wet.sampleRate))
    : clipLen(arranged);
  const trimmed =
    countLimited || params.fadeOutMs > 0 ? clipSlice(wet, keepFrames) : wet;

  report(0.82, "Applying envelope");
  await paint();
  const final = applyExportEnvelope(trimmed, params);

  report(0.88, "Encoding WAV");
  await paint();
  const title = project?.songTitle || song.meta.name;
  // Cover art is no longer embedded in exported WAVs (it is exported
  // separately via /export png); text tags only.
  const bytes = wavPcm16(final, {
    title,
    artist: project?.artist || undefined,
    album: project?.album || undefined,
  });

  report(0.95, "Writing file");
  await paint();
  const target = filePath.toLowerCase().endsWith(".wav")
    ? filePath
    : `${filePath}.wav`;
  const written = await session.host.fs.writeBytesSafe(target, bytes);
  if (!written.ok) return { ok: false, error: written.error };
  const capNote = autoCapped
    ? ` (capped at ${MAX_WAV_SECONDS}s — set a Track length for a longer export)`
    : "";
  report(1, "Done");
  session.setStatus(`Exported ${written.value}${capNote}`);
  return {
    ok: true,
    message: `Exported ${written.value}${capNote}`,
    path: written.value,
  };
}

/** Exports the headless cover-art scene as a PNG. */
export async function exportCoverPng(
  session: Session,
  filePath: string,
  size = 240,
): Promise<IoResult> {
  const song = session.getState().song;
  if (!song) return { ok: false, error: "No song loaded" };
  const bytes = coverPngBytes(song, { size });
  const target = filePath.toLowerCase().endsWith(".png")
    ? filePath
    : `${filePath}.png`;
  const written = await session.host.fs.writeBytesSafe(target, bytes);
  if (!written.ok) return { ok: false, error: written.error };
  session.setStatus(`Exported ${written.value}`);
  return {
    ok: true,
    message: `Exported ${written.value}`,
    path: written.value,
  };
}

export async function exportMidi(
  session: Session,
  filePath: string,
): Promise<IoResult> {
  const song = session.getState().song;
  if (!song) return { ok: false, error: "No song loaded" };
  const bytes = writeMidi(song);
  const target = filePath.toLowerCase().endsWith(".mid")
    ? filePath
    : `${filePath}.mid`;
  const written = await session.host.fs.writeBytesSafe(target, bytes);
  if (!written.ok) return { ok: false, error: written.error };
  session.setStatus(`Exported ${written.value}`);
  return {
    ok: true,
    message: `Exported ${written.value}`,
    path: written.value,
  };
}

/** Waits for source samples to finish decoding (used before packaging them). */
async function waitForSampler(
  session: Session,
  timeoutMs = 15_000,
): Promise<void> {
  const engine = session.backend;
  if (!engine) return;
  const deadline = Date.now() + timeoutMs;
  while (!engine.samplerReady() && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

/** Packages the decoded source samples into a STORE-method ZIP. */
export async function exportSamplesZip(
  session: Session,
  filePath: string,
): Promise<IoResult> {
  const engine = session.backend;
  const project = session.getState().project;
  if (!engine || !project) return { ok: false, error: "No project loaded" };
  await waitForSampler(session);
  const entries: Array<{ name: string; data: Uint8Array }> = [];
  for (let slot = 0; slot < 6; slot++) {
    if (!project.sourceSamples[slot]) continue;
    const clip = engine.sampleClip(slot);
    if (clip) entries.push({ name: `${slot}.wav`, data: wavPcm16(clip) });
  }
  if (entries.length === 0)
    return { ok: false, error: "No decoded source samples available" };
  const bytes = zipStore(entries);
  const target = filePath.toLowerCase().endsWith(".zip")
    ? filePath
    : `${filePath}.zip`;
  const written = await session.host.fs.writeBytesSafe(target, bytes);
  if (!written.ok) return { ok: false, error: written.error };
  session.setStatus(`Exported ${written.value}`);
  return {
    ok: true,
    message: `Exported ${written.value}`,
    path: written.value,
  };
}

export { basenameNoExt };
