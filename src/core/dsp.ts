/** Shared decoded-audio container, mirroring lantern-core's `dsp::AudioClip`. */
export interface AudioClip {
  channels: Float32Array[];
  sampleRate: number;
}

export function audioClip(
  channels: Float32Array[],
  sampleRate: number,
): AudioClip {
  let len = channels.length > 0 ? Number.POSITIVE_INFINITY : 0;
  for (const channel of channels) len = Math.min(len, channel.length);
  if (!Number.isFinite(len)) len = 0;
  const trimmed = channels.map((c) =>
    c.length === len ? c : c.subarray(0, len),
  );
  return { channels: trimmed, sampleRate };
}

export function clipLen(clip: AudioClip): number {
  return clip.channels[0]?.length ?? 0;
}

/**
 * Sample-and-hold sample-rate reduction (GBA-style decimation). Deterministic
 * and applied as the very last master stage; `rateHz >= sampleRate` is a no-op.
 * The live ScriptProcessor uses the same phase-accumulator algorithm.
 */
export function downsampleClip(clip: AudioClip, rateHz: number): AudioClip {
  const inputRate = clip.sampleRate;
  if (!(rateHz > 0) || rateHz >= inputRate || clipIsEmpty(clip)) return clip;
  const ratio = rateHz / inputRate; // < 1
  const channels = clip.channels.map((data) => {
    const out = new Float32Array(data.length);
    const last = data.length - 1;
    for (let i = 0; i < data.length; i++) {
      const source = Math.min(Math.floor(i * ratio), last);
      out[i] = data[source] ?? 0;
    }
    return out;
  });
  return audioClip(channels, inputRate);
}

export function clipIsEmpty(clip: AudioClip): boolean {
  return (
    clipLen(clip) === 0 || clip.channels.length === 0 || clip.sampleRate === 0
  );
}

export function clipDuration(clip: AudioClip): number {
  return clipLen(clip) / Math.max(clip.sampleRate, 1);
}

/** Returns a copy of `clip` shortened to `frames` per channel (or the clip itself). */
export function clipSlice(clip: AudioClip, frames: number): AudioClip {
  const length = Math.min(Math.max(frames, 0), clipLen(clip));
  if (length === clipLen(clip)) return clip;
  return audioClip(
    clip.channels.map((channel) => channel.subarray(0, length)),
    clip.sampleRate,
  );
}
