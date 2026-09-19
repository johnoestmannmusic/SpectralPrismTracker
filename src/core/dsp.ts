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
 * Sample-and-hold sample-rate reduction (GBA-style decimation), matching the
 * MicroTextures lo-fi stage: a one-pole low-pass at the target Nyquist to tame
 * aliasing, then an integer sample-and-hold. Deterministic and applied as the
 * very last master stage; `rateHz >= sampleRate` is a no-op.
 */
/** One-pole low-pass coefficient for a given cutoff and sample step. */
function onePoleCoeff(cutoff: number, dt: number): number {
  const rc = 1 / (2 * Math.PI * Math.max(cutoff, 1));
  return dt / (rc + dt);
}

export function downsampleClip(
  clip: AudioClip,
  rateHz: number,
  options: { lowpassEnabled?: boolean; lowpassHz?: number } = {},
): AudioClip {
  const inputRate = clip.sampleRate;
  if (!(rateHz > 0) || rateHz >= inputRate || clipIsEmpty(clip)) return clip;
  const factor = Math.max(1, Math.round(inputRate / rateHz));
  const dt = 1 / inputRate;
  const preCoeff = onePoleCoeff(Math.min(rateHz * 0.5, inputRate * 0.45), dt);
  const postOn = !!options.lowpassEnabled;
  const postCoeff = onePoleCoeff(options.lowpassHz ?? rateHz, dt);
  const channels = clip.channels.map((data) => {
    const out = new Float32Array(data.length);
    let pre = 0;
    let hold = 0;
    let post = 0;
    for (let i = 0; i < data.length; i++) {
      pre += preCoeff * (data[i]! - pre);
      if (i % factor === 0) hold = pre;
      let sample = hold;
      if (postOn) {
        post += postCoeff * (sample - post);
        sample = post;
      }
      out[i] = sample;
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
