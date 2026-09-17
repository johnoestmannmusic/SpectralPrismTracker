import * as webAudio from "node-web-audio-api";

/**
 * Node host shim for the Web Audio API. The `src/audio` layer was written
 * against the browser globals (`AudioContext`, `OfflineAudioContext`), so in
 * Node we install `node-web-audio-api` as those globals. Keeping this to a
 * single module means `src/audio` needs no import changes and the browser
 * build is unaffected (the globals already exist there).
 */

const GLOBAL_NAMES = [
  "AudioContext",
  "OfflineAudioContext",
  "BaseAudioContext",
  "AudioBuffer",
  "AudioNode",
  "AudioParam",
  "AnalyserNode",
  "AudioBufferSourceNode",
  "BiquadFilterNode",
  "ChannelMergerNode",
  "ChannelSplitterNode",
  "ConstantSourceNode",
  "ConvolverNode",
  "DelayNode",
  "DynamicsCompressorNode",
  "GainNode",
  "IIRFilterNode",
  "OscillatorNode",
  "PannerNode",
  "PeriodicWave",
  "StereoPannerNode",
  "WaveShaperNode",
] as const;

let installed = false;

/** Installs the Web Audio globals once. No-op when they already exist. */
export function installWebAudioGlobals(): void {
  if (installed) return;
  installed = true;
  const target = globalThis as unknown as Record<string, unknown>;
  const source = webAudio as unknown as Record<string, unknown>;
  for (const name of GLOBAL_NAMES) {
    if (target[name] === undefined && source[name] !== undefined) {
      target[name] = source[name];
    }
  }
}

/** True once the realtime/offline context constructors are usable. */
export function audioGlobalsAvailable(): boolean {
  const target = globalThis as unknown as Record<string, unknown>;
  return (
    typeof target.AudioContext === "function" &&
    typeof target.OfflineAudioContext === "function"
  );
}
