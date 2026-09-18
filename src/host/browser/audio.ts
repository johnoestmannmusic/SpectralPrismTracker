import type { HostAudio } from "../types";

/**
 * Browser audio bootstrap. The browser already provides the Web Audio globals
 * (`AudioContext`, `OfflineAudioContext`, …) so there is nothing to install.
 * Browser autoplay policy still requires a user gesture before an AudioContext
 * can start; the web shell resumes it on the first pointer/key event.
 */
export function installBrowserAudioGlobals(): void {
  /* no-op: globals already exist */
}

export function browserAudioGlobalsAvailable(): boolean {
  const target = globalThis as unknown as Record<string, unknown>;
  return (
    typeof target.AudioContext === "function" &&
    typeof target.OfflineAudioContext === "function"
  );
}

export const browserAudio: HostAudio = {
  installGlobals: installBrowserAudioGlobals,
  globalsAvailable: browserAudioGlobalsAvailable,
};
