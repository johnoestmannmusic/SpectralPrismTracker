import { clipLen, clipSlice, type AudioClip } from "@/core/dsp";
import {
  arrangeExport,
  applyExportEnvelope,
  renderSamplerMix,
  wavPcm16,
  zipStore,
} from "@/core/export";
import { parseFurFile } from "@/core/fur/node";
import { writeMidi } from "@/core/midi";
import { defaultProject, projectFromJson, projectToJson } from "@/core/project";
import type { ProjectFile } from "@/core/project";
import { defaultSamplerSettings, sequenceFromSong } from "@/core/sampler";
import { applyMasterFxOffline } from "@/audio/offline";
import { listSourceSamples } from "@/runtime/assets";
import { coverPngBytes } from "@/runtime/cover";
import {
  basenameNoExt,
  readBytesSafe,
  readTextSafe,
  writeBytesSafe,
} from "@/runtime/files";
import type { LoadedSong } from "@/shared/types";
import { buildSteps } from "@/core/stepthrough";
import type { Session } from "./session";

export interface IoResult {
  ok: boolean;
  message?: string;
  error?: string;
  path?: string;
}

async function bundledSamples(): Promise<{
  bytes: Array<Uint8Array | null>;
  names: string[];
}> {
  const samples = await listSourceSamples();
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
    return new Uint8Array(Buffer.from(dataUrl.slice(comma + 1), "base64"));
  } catch {
    return null;
  }
}

/** Builds a LoadedSong from project JSON, using embedded samples or bundled ones. */
export async function loadedSongFromProjectText(
  text: string,
): Promise<LoadedSong> {
  const project = projectFromJson(text);
  const embedded = project.sourceSamples.map((sample) =>
    sample?.dataUrl ? decodeDataUrl(sample.dataUrl) : null,
  );
  const samples = embedded.some(Boolean)
    ? embedded
    : (await bundledSamples()).bytes;
  return {
    project: text,
    samples,
  };
}

/** Opens a `.lampjson` or `.fur` file into the session. */
export async function openPath(
  session: Session,
  filePath: string,
): Promise<IoResult> {
  const lower = filePath.toLowerCase();
  if (lower.endsWith(".lampjson")) {
    const text = await readTextSafe(filePath);
    if (!text.ok) return { ok: false, error: text.error };
    try {
      const loaded = await loadedSongFromProjectText(text.value);
      await session.load(loaded);
      return { ok: true, message: `Opened ${filePath}`, path: filePath };
    } catch (error) {
      return { ok: false, error: `Cannot parse project: ${String(error)}` };
    }
  }
  if (lower.endsWith(".fur")) {
    const bytes = await readBytesSafe(filePath);
    if (!bytes.ok) return { ok: false, error: bytes.error };
    try {
      const raw = parseFurFile(bytes.value);
      const bundled = await bundledSamples();
      await session.load({
        raw,
        furBytes: bytes.value,
        project: projectToJson(
          withSampleNames(defaultProject(), bundled.names),
        ),
        samples: bundled.bytes,
      });
      return { ok: true, message: `Opened ${filePath}`, path: filePath };
    } catch (error) {
      return { ok: false, error: `Cannot parse .fur: ${String(error)}` };
    }
  }
  return {
    ok: false,
    error: `Unsupported file "${filePath}" (expected .lampjson or .fur)`,
  };
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
  const result = await writeBytesSafe(filePath, Buffer.from(payload, "utf8"));
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
    const bundled = await bundledSamples();
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
  const project = session.getState().project;
  if (!project) return { ok: false, error: "No project loaded" };
  const json = projectToJson(project, true);
  const written = await writeBytesSafe(
    filePath,
    new TextEncoder().encode(json),
  );
  if (!written.ok) return { ok: false, error: written.error };
  session.setStatus(`Saved ${written.value}`);
  return { ok: true, message: `Saved ${written.value}`, path: written.value };
}

export interface WavExportOptions {
  loops?: number;
  fadeInMs?: number;
  fadeOutMs?: number;
  normalize?: boolean;
}

/** Waits for spectral fusion renders so the export uses the fused clips. */
async function waitForFusion(session: Session): Promise<void> {
  const engine = session.backend;
  if (!engine) return;
  const { settings } = session.getState();
  const pending = () =>
    settings.some(
      (setting, i) =>
        setting.spectral.enabled &&
        setting.sourceIndex !== null &&
        !engine.fusionReady(i),
    );
  const deadline = Date.now() + 30_000;
  while (pending() && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

export async function exportWav(
  session: Session,
  filePath: string,
  options: WavExportOptions = {},
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

  await waitForFusion(session);
  const clips: Array<AudioClip | null> = settings.map((_, i) =>
    engine.effectiveClip(i),
  );
  const base = renderSamplerMix(
    sequenceFromSong(song),
    settings,
    clips,
    channelVolume,
    channelMuted,
    masterVolume,
  );

  const params = {
    loops: Math.max(0, Math.floor(options.loops ?? 0)),
    fadeInMs: options.fadeInMs ?? 0,
    fadeOutMs: options.fadeOutMs ?? 0,
    normalize: options.normalize ?? false,
  };
  const arranged = arrangeExport(base, params.loops, params.fadeOutMs);
  const wet = await applyMasterFxOffline(arranged, masterFx);
  const trimmed =
    params.fadeOutMs > 0 ? clipSlice(wet, clipLen(arranged)) : wet;
  const final = applyExportEnvelope(trimmed, params);
  const title = project?.songTitle || song.meta.name;
  const bytes = wavPcm16(final, {
    title,
    artist: project?.artist || undefined,
    album: project?.album || undefined,
    artwork: coverPngBytes(song, { size: 600 }),
  });
  const target = filePath.toLowerCase().endsWith(".wav")
    ? filePath
    : `${filePath}.wav`;
  const written = await writeBytesSafe(target, bytes);
  if (!written.ok) return { ok: false, error: written.error };
  session.setStatus(`Exported ${written.value}`);
  return {
    ok: true,
    message: `Exported ${written.value}`,
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
  const written = await writeBytesSafe(target, bytes);
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
  const written = await writeBytesSafe(target, bytes);
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
  const written = await writeBytesSafe(target, bytes);
  if (!written.ok) return { ok: false, error: written.error };
  session.setStatus(`Exported ${written.value}`);
  return {
    ok: true,
    message: `Exported ${written.value}`,
    path: written.value,
  };
}

/** Saves the original `.fur` bytes when the song came from a Furnace module. */
export async function exportFur(
  session: Session,
  filePath: string,
  furBytes: Uint8Array | null,
): Promise<IoResult> {
  if (!furBytes)
    return { ok: false, error: "This song has no original .fur data" };
  const target = filePath.toLowerCase().endsWith(".fur")
    ? filePath
    : `${filePath}.fur`;
  const written = await writeBytesSafe(target, furBytes);
  if (!written.ok) return { ok: false, error: written.error };
  session.setStatus(`Exported ${written.value}`);
  return {
    ok: true,
    message: `Exported ${written.value}`,
    path: written.value,
  };
}

export { basenameNoExt };
