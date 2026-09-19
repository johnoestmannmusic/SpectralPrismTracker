import {
  audioClip,
  clipDuration,
  clipIsEmpty,
  clipLen,
  type AudioClip,
} from "./dsp";
import {
  envelopeAt,
  region,
  sequenceDuration,
  type SamplerSettings,
  type Sequence,
} from "./sampler";
import { buildWavMetadataChunks, type WavTags } from "./wavTags";

function pushU16(out: number[], value: number): void {
  out.push(value & 0xff, (value >>> 8) & 0xff);
}

function pushU32(out: number[], value: number): void {
  out.push(
    value & 0xff,
    (value >>> 8) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 24) & 0xff,
  );
}

/**
 * Encodes an AudioClip as a canonical 16-bit PCM WAV file.
 *
 * Writes straight into one preallocated `Uint8Array` (BUG-37). The previous
 * implementation accumulated a JS `number[]` of every byte and then copied it —
 * ~8x the memory and enough GC pressure to freeze (or OOM) the whole-song
 * export.
 */
export function wavPcm16(clip: AudioClip, tags?: WavTags): Uint8Array {
  const channels = clip.channels.length;
  if (clipIsEmpty(clip)) throw new Error("Audio clip is empty");
  if (channels > 65535) throw new Error("Too many channels for a WAV file");
  const blockAlign = channels * 2;
  const frames = clipLen(clip);
  const dataSize = frames * blockAlign;
  if (dataSize > 0xffffffff - 36)
    throw new Error("Audio is too large for a PCM WAV file");

  const metadata = tags ? buildWavMetadataChunks(tags) : new Uint8Array(0);

  const out = new Uint8Array(44 + dataSize + metadata.length);
  const view = new DataView(out.buffer);
  let offset = 0;
  const writeAscii = (s: string) => {
    for (let i = 0; i < s.length; i++) out[offset++] = s.charCodeAt(i) & 0xff;
  };
  const u16 = (value: number) => {
    view.setUint16(offset, value & 0xffff, true);
    offset += 2;
  };
  const u32 = (value: number) => {
    view.setUint32(offset, value >>> 0, true);
    offset += 4;
  };

  writeAscii("RIFF");
  u32(36 + dataSize + metadata.length);
  writeAscii("WAVEfmt ");
  u32(16);
  u16(1);
  u16(channels);
  u32(clip.sampleRate);
  u32(clip.sampleRate * blockAlign);
  u16(blockAlign);
  u16(16);
  writeAscii("data");
  u32(dataSize);

  for (let frame = 0; frame < frames; frame++) {
    for (let c = 0; c < channels; c++) {
      const raw = clip.channels[c]![frame]!;
      const sample = Math.min(Math.max(raw, -1), 1);
      const value =
        sample < 0 ? Math.trunc(sample * 32768) : Math.trunc(sample * 32767);
      view.setUint16(offset, value & 0xffff, true);
      offset += 2;
    }
  }

  out.set(metadata, offset);
  return out;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++)
    c = CRC_TABLE[(c ^ data[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export interface ZipEntry {
  name: string;
  data: Uint8Array;
}

/** Minimal STORE-method (uncompressed) ZIP writer, matching lantern-core. */
export function zipStore(entries: ZipEntry[]): Uint8Array {
  if (entries.length > 65535) throw new Error("Too many ZIP entries");
  const encoder = new TextEncoder();
  const local: number[] = [];
  const central: number[] = [];

  const u16 = (out: number[], v: number) => pushU16(out, v);
  const u32 = (out: number[], v: number) => pushU32(out, v);

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.name);
    if (entry.name.length === 0 || nameBytes.length > 65535) {
      throw new Error("Invalid ZIP entry name");
    }
    for (const byte of nameBytes) {
      if (byte > 0x7f) throw new Error("ZIP entry names must be ASCII");
    }
    const crc = crc32(entry.data);
    const size = entry.data.length;
    const offset = local.length;

    u32(local, 0x04034b50);
    u16(local, 20);
    u16(local, 0);
    u16(local, 0);
    u16(local, 0);
    u16(local, 0x0021);
    u32(local, crc);
    u32(local, size);
    u32(local, size);
    u16(local, nameBytes.length);
    u16(local, 0);
    for (const b of nameBytes) local.push(b);
    for (const b of entry.data) local.push(b);

    u32(central, 0x02014b50);
    u16(central, 20);
    u16(central, 20);
    u16(central, 0);
    u16(central, 0);
    u16(central, 0);
    u16(central, 0x0021);
    u32(central, crc);
    u32(central, size);
    u32(central, size);
    u16(central, nameBytes.length);
    u16(central, 0);
    u16(central, 0);
    u16(central, 0);
    u16(central, 0);
    u32(central, 0);
    u32(central, offset);
    for (const b of nameBytes) central.push(b);
  }

  const centralOffset = local.length;
  const all = local.concat(central);
  u32(all, 0x06054b50);
  u16(all, 0);
  u16(all, 0);
  u16(all, entries.length);
  u16(all, entries.length);
  u32(all, central.length);
  u32(all, centralOffset);
  u16(all, 0);

  return Uint8Array.from(all);
}

// ---- Export finalisation (looping, fades, peak normalise) ----

export interface ExportParams {
  /** Extra repeats after the first pass (0 = play the song once). */
  loops: number;
  fadeInMs: number;
  fadeOutMs: number;
  normalize: boolean;
  /**
   * Cycles track-length cap in seconds (FEAT-157). When > 0 the export fills
   * this exact length and the fade-out lands inside it instead of appending a
   * fade pass that restarts the patterns.
   */
  lengthSeconds?: number;
}

/**
 * Arranges `loops + 1` full passes of the song joined with no gap, followed by
 * a `fadeOutMs` tail that keeps looping the source. No fades or gain changes are
 * applied here, so the result can be handed to the Master FX chain as one
 * continuous signal (effects must not be baked in per loop, or each repeat would
 * carry its own decaying tail and leave a gap before the next).
 */
/** Arranges a source clip for export. When `lengthSeconds` is set (Cycles
 * track-length mode) the clip is repeated to fill the requested length with no
 * appended fade pass, so the fade-out applied later lands inside the track
 * instead of restarting the patterns (FEAT-157). Otherwise the source is
 * repeated `loops + 1` times and a `fadeOutMs` pass is appended, as before. */
export function arrangeForExport(
  source: AudioClip,
  params: ExportParams,
): AudioClip {
  const lengthSeconds = params.lengthSeconds ?? 0;
  if (lengthSeconds > 0) {
    const frames = clipLen(source);
    const seconds = frames > 0 ? frames / source.sampleRate : 0;
    const passes =
      seconds > 0 ? Math.max(1, Math.ceil(lengthSeconds / seconds)) : 1;
    return arrangeExport(source, passes - 1, 0);
  }
  return arrangeExport(source, params.loops, params.fadeOutMs);
}

export function arrangeExport(
  clip: AudioClip,
  loops: number,
  fadeOutMs: number,
): AudioClip {
  const srcLen = clipLen(clip);
  if (srcLen === 0 || clip.channels.length === 0) return clip;

  const rate = clip.sampleRate;
  const passes = Math.max(0, Math.floor(loops)) + 1;
  const fadeOutFrames = Math.max(0, Math.round((fadeOutMs / 1000) * rate));
  const fullFrames = srcLen * passes;
  const total = fullFrames + fadeOutFrames;

  const out: Float32Array[] = [];
  for (const channel of clip.channels) {
    const dst = new Float32Array(total);
    for (let r = 0; r < passes; r++)
      dst.set(channel.subarray(0, srcLen), r * srcLen);
    for (let j = 0; j < fadeOutFrames; j++)
      dst[fullFrames + j] = channel[j % srcLen]!;
    out.push(dst);
  }
  return audioClip(out, rate);
}

/**
 * Applies the export envelope to an already-arranged clip: a fade-in over the
 * first `fadeInMs`, a fade-out over the final `fadeOutMs`, and peak
 * normalisation. The fade-out must be applied here (after Master FX) so the
 * reverb/delay tail cannot ring past the intended end.
 */
export function applyExportEnvelope(
  clip: AudioClip,
  params: ExportParams,
): AudioClip {
  const total = clipLen(clip);
  if (total === 0 || clip.channels.length === 0) return clip;

  const rate = clip.sampleRate;
  const fadeInFrames = Math.max(0, Math.round((params.fadeInMs / 1000) * rate));
  const fadeOutFrames = Math.max(
    0,
    Math.round((params.fadeOutMs / 1000) * rate),
  );
  const fadeIn = Math.min(fadeInFrames, total);
  const fadeOut = Math.min(fadeOutFrames, total);
  const fadeOutStart = total - fadeOut;
  const fadeOutDenom = Math.max(fadeOut - 1, 1);

  const out: Float32Array[] = [];
  for (const channel of clip.channels) {
    const data = new Float32Array(channel);
    for (let i = 0; i < fadeIn; i++) data[i] = data[i]! * (i / fadeIn);
    for (let i = 0; i < fadeOut; i++) {
      const index = fadeOutStart + i;
      data[index] = data[index]! * ((fadeOut - 1 - i) / fadeOutDenom);
    }
    out.push(data);
  }

  if (params.normalize) {
    let peak = 0;
    for (const data of out) {
      for (let i = 0; i < total; i++) {
        const value = Math.abs(data[i]!);
        if (value > peak) peak = value;
      }
    }
    if (peak > 0) {
      const gain = 1 / peak;
      for (const data of out)
        for (let i = 0; i < total; i++) data[i] = data[i]! * gain;
    }
  }

  return audioClip(out, rate);
}

export function finalizeExport(
  clip: AudioClip,
  params: ExportParams,
): AudioClip {
  return applyExportEnvelope(
    arrangeExport(clip, params.loops, params.fadeOutMs),
    params,
  );
}

// ---- Offline sampler mixdown (ports lantern-core::export::render_sampler_mix) ----

const OUTPUT_RATE = 44_100;

interface RateRamp {
  start: number;
  end: number;
  from: number;
  to: number;
}

interface RenderVoice {
  instrument: number;
  channel: number;
  start: number;
  end: number;
  release: { start: number; level: number; duration: number } | null;
  rate: number;
  rateRamps: RateRamp[];
  level: number;
  pan: number;
  settings: SamplerSettings;
  clip: AudioClip;
  stolen: boolean;
  /** Shared id for the voices of one chord. */
  group?: number;
  /** Start position within the region, 0..1 (13xx sample offset). */
  offsetFraction: number;
  /** Play the region backwards (12xx reverse). */
  reverse: boolean;
  /** Slow tape-drift detune in cents. */
  detuneCents: number;
  /** 14xx hold/freeze: loop the region until the next note/off. */
  hold: boolean;
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(Math.max(value, low), high);
}

function mod(value: number, m: number): number {
  return ((value % m) + m) % m;
}

function rateAt(voice: RenderVoice, time: number): number {
  let current = voice.rate;
  for (const ramp of voice.rateRamps) {
    if (time < ramp.start) return current;
    if (time <= ramp.end) {
      const amount =
        (time - ramp.start) / Math.max(ramp.end - ramp.start, 0.0001);
      return ramp.from + (ramp.to - ramp.from) * amount;
    }
    current = ramp.to;
  }
  return current;
}

/** Base playback rate plus this voice's optional drift/vibrato modulation. */
function modulatedRate(voice: RenderVoice, time: number, base: number): number {
  let rate = base;
  if (voice.detuneCents !== 0) {
    rate *= Math.pow(2, voice.detuneCents / 1200);
  }
  const depth = voice.settings.vibratoDepth;
  const speed = voice.settings.vibratoSpeed;
  if (depth > 0 && speed > 0) {
    const phase = 2 * Math.PI * speed * (time - voice.start);
    rate *= Math.pow(2, (depth * Math.sin(phase)) / 12);
  }
  return rate;
}

function voiceEnvelope(voice: RenderVoice, time: number): number {
  if (voice.release && time >= voice.release.start) {
    const { start, level, duration } = voice.release;
    return level * clamp(1 - (time - start) / Math.max(duration, 0.0001), 0, 1);
  }
  return voice.level * envelopeAt(voice.settings, time - voice.start);
}

function releaseVoice(
  voice: RenderVoice,
  time: number,
  duration: number,
  stolen: boolean,
): void {
  if (voice.end <= time) return;
  const level = voiceEnvelope(voice, time);
  voice.release = { start: time, level, duration };
  voice.end = Math.min(voice.end, time + duration + 0.02);
  voice.stolen = voice.stolen || stolen;
}

/** Hard cut (choke): end the voice immediately, skipping the release tail. */
function cutVoice(voice: RenderVoice, time: number): void {
  if (voice.end <= time) return;
  voice.release = { start: time, level: 0, duration: 0 };
  voice.end = Math.min(voice.end, time);
  voice.stolen = true;
}

/**
 * Renders the current sampler sequence offline to a stereo AudioClip,
 * applying per-instrument trim/loop/ADSR/transpose/pan, stage release and
 * channel/master mix — the same semantics as live Web Audio playback.
 */
export function renderSamplerMix(
  sequence: Sequence,
  settings: SamplerSettings[],
  clips: Array<AudioClip | null>,
  channelVolume: number[],
  channelMuted: boolean[],
  master: number,
  /**
   * Optional cap in seconds (FEAT-156). Caps the allocation and stops
   * scheduling rows past the cap, so a 20 s export of a long song does not
   * render the whole song first.
   */
  maxSeconds = 0,
): AudioClip {
  const fullDuration = sequenceDuration(sequence);
  const duration =
    maxSeconds > 0 ? Math.min(fullDuration, maxSeconds) : fullDuration;
  const voices: RenderVoice[] = [];
  const lastByChannel: Array<RenderVoice | null> = [null, null, null, null];

  for (let row = 0; row < sequence.rows.length; row++) {
    const time = sequence.rowTimes[row] ?? 0;
    if (maxSeconds > 0 && time >= duration) break;
    for (const event of sequence.rows[row] ?? []) {
      if (event.type === "off") {
        // Release every voice on the channel (all chord tones together);
        // `choke` instruments cut immediately instead.
        for (const voice of voices) {
          if (
            voice.channel === event.channel &&
            voice.end > time &&
            !voice.stolen
          ) {
            if (voice.settings.choke) cutVoice(voice, time);
            else
              releaseVoice(
                voice,
                time,
                clamp(voice.settings.release, 0, 5),
                false,
              );
          }
        }
        continue;
      }
      if (event.type === "pitchRamp") {
        const voice = lastByChannel[event.channel];
        if (voice && voice.end > time && !voice.stolen) {
          const from = rateAt(voice, time);
          const to =
            event.rate *
            Math.pow(2, clamp(voice.settings.transpose, -48, 48) / 12);
          voice.rateRamps.push({
            start: time,
            end: time + event.duration,
            from,
            to,
          });
        }
        continue;
      }

      const setting = settings[event.instrument];
      const clip = clips[event.instrument];
      if (!setting || !clip) continue;
      if (setting.muted || setting.sourceIndex === null) continue;
      if (!region(setting, clipDuration(clip))) continue;

      const group = event.voiceGroup;
      if (setting.polyphonic) {
        const cap = Math.floor(clamp(setting.voiceCap, 1, 32));
        const active = () =>
          voices.filter(
            (v) =>
              v.instrument === event.instrument && v.end > time && !v.stolen,
          );
        const candidates = () =>
          active().filter((v) => group === undefined || v.group !== group);
        while (active().length >= cap && candidates().length > 0) {
          const victim = candidates()[0];
          if (!victim) break;
          releaseVoice(victim, time, 0.008, true);
        }
      } else {
        for (const voice of voices) {
          if (
            voice.channel !== event.channel ||
            voice.end <= time ||
            voice.stolen
          )
            continue;
          if (group !== undefined && voice.group === group) continue;
          if (voice.settings.choke) cutVoice(voice, time);
          else releaseVoice(voice, time, 0.008, true);
        }
      }

      const panCentre = clamp(setting.pan, -1, 1);
      const pan = clamp(
        panCentre +
          clamp(event.panOffset ?? 0, -1, 1) +
          clamp(event.panRandom ?? 0, -1, 1),
        -1,
        1,
      );
      const rate =
        event.rate * Math.pow(2, clamp(setting.transpose, -48, 48) / 12);
      const voice: RenderVoice = {
        instrument: event.instrument,
        channel: event.channel,
        start: time + (event.delaySec ?? 0),
        end: duration,
        release: null,
        rate,
        rateRamps: [],
        level: event.volume * clamp(setting.volume, 0, 1.5),
        pan,
        settings: setting,
        clip,
        stolen: false,
        group,
        offsetFraction: event.offsetFraction ?? 0,
        reverse: event.reverse ?? false,
        detuneCents: event.detuneCents ?? 0,
        hold: event.hold ?? false,
      };
      voices.push(voice);
      lastByChannel[event.channel] = voice;
    }
  }

  const frames = Math.ceil(duration * OUTPUT_RATE) + 1;
  const left = new Float32Array(frames);
  const right = new Float32Array(frames);

  for (const voice of voices) {
    const reg = region(voice.settings, clipDuration(voice.clip));
    if (!reg) continue;
    let [regionStart, regionLen] = reg;
    // Reverse plays the whole clip backwards (matching realtime), ignoring trim.
    if (voice.reverse) {
      regionStart = 0;
      regionLen = clipDuration(voice.clip);
    }
    const offset = clamp(voice.offsetFraction, 0, 1) * regionLen;
    const startFrame = Math.floor(voice.start * OUTPUT_RATE);
    const endFrame = Math.min(
      Math.ceil(Math.min(voice.end, duration) * OUTPUT_RATE),
      frames,
    );
    const mix = channelMuted[voice.channel]
      ? 0
      : (channelVolume[voice.channel] ?? 1) * master;
    const angle = ((voice.pan + 1) * Math.PI) / 4;
    const mono = voice.clip.channels.length === 1;
    const regionChannel = (ch: number) =>
      voice.clip.channels[Math.min(ch, voice.clip.channels.length - 1)]!;

    let traveled = 0;
    let previousTime = voice.start;
    let previousRate = modulatedRate(
      voice,
      voice.start,
      rateAt(voice, voice.start),
    );

    for (let frame = startFrame; frame < endFrame; frame++) {
      const t = frame / OUTPUT_RATE;
      const rate = modulatedRate(voice, t, rateAt(voice, t));
      traveled += (t - previousTime) * ((rate + previousRate) / 2);
      previousTime = t;
      previousRate = rate;

      const travel = offset + traveled;
      const loops = voice.settings.looping || voice.hold;
      let rel: number;
      if (loops && voice.settings.pingPong) {
        const phase = mod(travel, 2 * regionLen);
        rel = phase <= regionLen ? phase : 2 * regionLen - phase;
      } else if (loops) {
        rel = mod(travel, regionLen);
      } else if (travel < regionLen) {
        rel = travel;
      } else {
        break;
      }
      // 12xx: read the region backwards.
      const readRel = voice.reverse ? regionLen - rel : rel;

      const sourceFrame = (regionStart + readRel) * voice.clip.sampleRate;
      const i0 = Math.floor(sourceFrame);
      const frac = sourceFrame - i0;
      const sample = (ch: number): number => {
        const data = regionChannel(ch);
        const a = data[i0] ?? 0;
        const b = data[i0 + 1] ?? a;
        return a + (b - a) * frac;
      };

      const fade = Math.max(Math.min(0.005, regionLen / 2), 1e-9);
      const edge = clamp(Math.min(rel / fade, (regionLen - rel) / fade), 0, 1);
      const gain = voiceEnvelope(voice, t) * mix * edge;

      if (mono) {
        const s = sample(0);
        left[frame] = left[frame]! + s * Math.cos(angle) * gain;
        right[frame] = right[frame]! + s * Math.sin(angle) * gain;
      } else {
        // Match the live StereoPannerNode exactly. For a stereo input the
        // panner folds opposite-channel content with equal-power gains rather
        // than simply attenuating, which the old `L*(1-pan)` law did not.
        const l = sample(0);
        const r = sample(1);
        const p = clamp(voice.pan, -1, 1);
        const x = p <= 0 ? p + 1 : p;
        const gainL = Math.cos((x * Math.PI) / 2);
        const gainR = Math.sin((x * Math.PI) / 2);
        if (p <= 0) {
          left[frame] = left[frame]! + (l + r * gainL) * gain;
          right[frame] = right[frame]! + r * gainR * gain;
        } else {
          left[frame] = left[frame]! + l * gainL * gain;
          right[frame] = right[frame]! + (r + l * gainR) * gain;
        }
      }
    }
  }

  return audioClip([left, right], OUTPUT_RATE);
}
