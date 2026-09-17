import { describe, expect, it } from "vitest";
import { audioGlobalsAvailable, installWebAudioGlobals } from "@/runtime/audio";
import { decodeAudioBytes } from "@/audio/offline";
import { readAsset } from "@/runtime/assets";

describe("node web audio shim", () => {
  it("installs the Web Audio globals", () => {
    installWebAudioGlobals();
    expect(audioGlobalsAvailable()).toBe(true);
  });

  it("decodes a bundled OGG through the Node host", async () => {
    installWebAudioGlobals();
    const bytes = await readAsset("SourceSamples/1.ogg");
    expect(bytes).not.toBeNull();

    const clip = await decodeAudioBytes(bytes!, 44_100);
    expect(clip.channels.length).toBeGreaterThan(0);
    expect(clip.channels[0]!.length).toBeGreaterThan(0);
    expect(clip.sampleRate).toBe(44_100);
    // The clip should contain actual signal, not silence.
    const peak = clip.channels[0]!.reduce(
      (max, sample) => Math.max(max, Math.abs(sample)),
      0,
    );
    expect(peak).toBeGreaterThan(0);
  });
});
