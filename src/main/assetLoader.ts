import { dialog } from "electron";
import { loadDefaultSong as loadDefaultSongRuntime } from "../runtime/assets";
import {
  readAudioChoice,
  saveFilterFor,
  writeBytesSafe,
} from "../runtime/files";
import type { AudioFileChoice, LoadedSong } from "../shared/types";

/**
 * Thin Electron adapter over the shared Node runtime. The actual asset and file
 * logic lives in `src/runtime/*` so the terminal app can use it without
 * Electron; this module only adds the native dialogs. Retired in FEAT-30.
 */

export function loadDefaultSong(): Promise<LoadedSong | { error: string }> {
  return loadDefaultSongRuntime();
}

export async function chooseAudioFile(): Promise<
  AudioFileChoice | { error: string }
> {
  const result = await dialog.showOpenDialog({
    properties: ["openFile"],
    filters: [{ name: "Audio", extensions: ["wav", "ogg", "mp3"] }],
  });
  if (result.canceled || result.filePaths.length === 0)
    return { error: "cancelled" };
  return readAudioChoice(result.filePaths[0]!);
}

export async function saveFile(
  suggestedName: string,
  bytes: Uint8Array,
): Promise<boolean> {
  const filter = saveFilterFor(suggestedName);
  const result = await dialog.showSaveDialog({
    defaultPath: suggestedName,
    filters: filter ? [filter] : undefined,
  });
  if (result.canceled || !result.filePath) return false;
  const written = await writeBytesSafe(result.filePath, bytes, {
    createDirs: false,
  });
  return written.ok;
}
