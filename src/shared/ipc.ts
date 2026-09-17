import type { AudioFileChoice, LoadedSong, SaveFileRequest } from "./types";

/**
 * Electron IPC bridge surface. Kept separate from the dependency-free domain
 * types in `./types` so the Node/TUI runtime never has to import (or think
 * about) the Electron shell. Retired along with Electron in FEAT-30.
 */
export const IPC = {
  loadDefaultSong: "assets:load-default-song",
  chooseAudioFile: "assets:choose-audio-file",
  saveFile: "file:save",
  openExternal: "shell:open-external",
} as const;

export interface LanternApi {
  loadDefaultSong(): Promise<LoadedSong | { error: string }>;
  chooseAudioFile(): Promise<AudioFileChoice | { error: string }>;
  saveFile(suggestedName: string, bytes: Uint8Array): Promise<boolean>;
  openExternal(url: string): Promise<void>;
}

export type { SaveFileRequest };
