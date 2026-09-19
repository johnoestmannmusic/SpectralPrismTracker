import { clipDuration, audioClip, type AudioClip } from "@/core/dsp";
import {
  LOOKAHEAD_SEC,
  Scheduler,
  envelopeAt,
  envelopeShape,
  loopChannel,
  region,
  samplePosition,
  waveform,
  type SamplerEvent,
  type SamplerSettings,
  type Sequence,
} from "@/core/sampler";
import {
  spectralRender,
  spectralRenderEnabled,
  spectralWasmAvailable,
} from "@/core/spectral";
import type { SamplePlayhead } from "./backend";

export class Voice {
  released: { start: number; level: number; duration: number } | null = null;
  stolen = false;

  constructor(
    public source: AudioBufferSourceNode,
    public gain: GainNode,
    public pan: StereoPannerNode,
    public channel: number,
    public instrument: number,
    public settings: SamplerSettings,
    public level: number,
    public start: number,
    public end: number,
    public rate: number,
    public lfo: OscillatorNode | null = null,
    public lfoGain: GainNode | null = null,
    /** Shared id for the voices of one chord; OFF releases the whole group. */
    public group?: number,
  ) {}

  levelAt(when: number): number {
    if (this.released && when >= this.released.start) {
      const { start, level, duration } = this.released;
      return (
        level *
        Math.min(
          Math.max(1 - (when - start) / Math.max(duration, 0.0001), 0),
          1,
        )
      );
    }
    return this.level * envelopeAt(this.settings, when - this.start);
  }

  release(when: number, fade: number): void {
    if (
      this.end <= when ||
      (this.released &&
        this.released.start + this.released.duration <= when + fade)
    ) {
      return;
    }
    const level = this.levelAt(when);
    const param = this.gain.gain as AudioParam & {
      cancelAndHoldAtTime?: (cancelTime: number) => void;
    };
    if (typeof param.cancelAndHoldAtTime === "function") {
      // Preserve the in-flight envelope up to `when`. A plain
      // cancelScheduledValues() drops the decay ramp, so the gain jumps back to
      // the attack level until `when` (heard as the previous note's volume
      // coming back up when the next note is scheduled ahead of time).
      param.cancelAndHoldAtTime(when);
      // node-web-audio-api mis-schedules a ramp added straight after the hold;
      // re-anchor the held value at `when` before fading out.
      param.linearRampToValueAtTime(level, when);
    } else {
      param.cancelScheduledValues(when);
      param.setValueAtTime(level, when);
    }
    param.linearRampToValueAtTime(0, when + fade);
    try {
      this.source.stop(when + fade + 0.02);
    } catch {
      /* already stopped */
    }
    if (this.lfo) {
      try {
        this.lfo.stop(when + fade + 0.05);
      } catch {
        /* already stopped */
      }
    }
    this.released = { start: when, level, duration: fade };
    this.end = Math.min(this.end, when + fade + 0.02);
  }

  /**
   * Hard cut (choke): silence the voice immediately, skipping the ADSR
   * release. A ~3 ms ramp avoids a click but otherwise ends the sound at once.
   */
  cut(when: number): void {
    if (this.end <= when) return;
    const t = Math.max(when, this.start);
    const param = this.gain.gain as AudioParam & {
      cancelAndHoldAtTime?: (cancelTime: number) => void;
    };
    if (typeof param.cancelAndHoldAtTime === "function") {
      param.cancelAndHoldAtTime(t);
    } else {
      param.cancelScheduledValues(t);
      param.setValueAtTime(0, t);
    }
    param.linearRampToValueAtTime(0, t + 0.003);
    try {
      this.source.stop(t + 0.005);
    } catch {
      /* already stopped */
    }
    if (this.lfo) {
      try {
        this.lfo.stop(t + 0.005);
      } catch {
        /* already stopped */
      }
    }
    this.released = { start: t, level: 0, duration: 0.003 };
    this.end = Math.min(this.end, t + 0.005);
  }

  position(now: number): number {
    return samplePosition(this.settings, now - this.start, this.rate);
  }

  playhead(now: number): SamplePlayhead | null {
    if (!(this.start <= now && now < this.end)) return null;
    if (this.settings.sourceIndex === null) return null;
    return {
      source: this.settings.sourceIndex,
      instrument: this.instrument,
      position: this.position(now),
      fused: spectralRenderEnabled(this.settings.spectral),
      level: Math.min(Math.max(this.levelAt(now), 0.15), 1),
    };
  }

  pitchRamp(baseRate: number, when: number, duration: number): void {
    const target =
      baseRate *
      Math.pow(2, Math.min(Math.max(this.settings.transpose, -48), 48) / 12);
    this.source.playbackRate.setValueAtTime(this.rate, when);
    this.source.playbackRate.linearRampToValueAtTime(
      target,
      when + Math.max(duration, 0.0001),
    );
    if (!this.settings.looping) {
      const regionLen = Math.max(
        this.settings.endSec - this.settings.startSec,
        0,
      );
      this.end = Math.max(
        this.end,
        when + regionLen / Math.max(Math.min(this.rate, target), 0.001),
      );
    }
    this.rate = target;
  }

  dispose(): void {
    try {
      this.source.stop();
    } catch {
      /* already stopped */
    }
    try {
      this.lfo?.stop();
    } catch {
      /* already stopped */
    }
    try {
      this.source.disconnect();
      this.gain.disconnect();
      this.pan.disconnect();
      this.lfo?.disconnect();
      this.lfoGain?.disconnect();
    } catch {
      /* already disconnected */
    }
  }
}

export function buildVoice(
  ctx: BaseAudioContext,
  buffer: AudioBuffer,
  settings: SamplerSettings,
  instrument: number,
  channel: number,
  baseRate: number,
  volume: number,
  when: number,
  destination: AudioNode,
  panOffset = 0,
  group?: number,
  offsetFraction = 0,
  reverse = false,
  detuneCents = 0,
  hold = false,
): Voice {
  const source = ctx.createBufferSource();
  const gain = ctx.createGain();
  const pan = ctx.createStereoPanner();

  const rate =
    baseRate *
    Math.pow(2, Math.min(Math.max(settings.transpose, -48), 48) / 12);
  const level = volume * Math.min(Math.max(settings.volume, 0), 1.5);
  const { attack, decay, sustain } = envelopeShape(settings);

  source.buffer = buffer;
  source.playbackRate.value = rate;
  if (detuneCents !== 0) source.detune.value = detuneCents;

  // Vibrato: a sine LFO offsetting playbackRate via `detune` (cents), so it
  // layers on top of any pitch ramp rather than replacing it.
  let lfo: OscillatorNode | null = null;
  let lfoGain: GainNode | null = null;
  if (settings.vibratoDepth > 0 && settings.vibratoSpeed > 0) {
    lfo = ctx.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = settings.vibratoSpeed;
    lfoGain = ctx.createGain();
    lfoGain.gain.value = settings.vibratoDepth * 100;
    lfo.connect(lfoGain);
    lfoGain.connect(source.detune);
    lfo.start(when);
  }

  gain.gain.setValueAtTime(0, when);
  gain.gain.linearRampToValueAtTime(level, when + attack);
  gain.gain.linearRampToValueAtTime(level * sustain, when + attack + decay);

  const panCentre = Math.min(Math.max(settings.pan, -1), 1);
  const panWidth = Math.min(Math.max(settings.panRandomRange, 0), 1);
  pan.pan.value = Math.min(
    Math.max(
      panCentre +
        Math.min(Math.max(panOffset, -1), 1) +
        (Math.random() * 2 - 1) * panWidth,
      -1,
    ),
    1,
  );

  source.connect(gain);
  gain.connect(pan);
  pan.connect(destination);

  let end: number;
  const f = Math.min(Math.max(offsetFraction, 0), 1);
  const looping = settings.looping || hold;
  if (looping) {
    const total = buffer.duration;
    let loopStart = 0;
    let loopEnd = total;
    let startOffset = reverse ? f * total : 0;
    if (hold && !settings.looping) {
      // 14xx hold: loop the trimmed region so the note sustains until OFF.
      const reg = reverse
        ? ([0, total] as [number, number])
        : region(settings, total);
      if (reg) {
        loopStart = reg[0];
        loopEnd = reg[0] + reg[1];
        startOffset = loopStart + f * reg[1];
      }
    }
    source.loop = true;
    source.loopStart = loopStart;
    source.loopEnd = loopEnd;
    source.start(when, startOffset);
    end = Number.POSITIVE_INFINITY;
  } else {
    const reg = reverse
      ? ([0, buffer.duration] as [number, number])
      : region(settings, buffer.duration);
    if (!reg) throw new Error("Empty trim");
    const [offset, length] = reg;
    const startOffset = offset + f * length;
    const playLength = length - f * length;
    if (playLength <= 0) throw new Error("Empty trim");
    source.start(when, startOffset, playLength);
    const playDuration = playLength / rate;
    end = when + playDuration;
    if (lfo) {
      try {
        lfo.stop(end + 0.05);
      } catch {
        /* already stopped */
      }
    }
    // Short fade at the end so a one-shot that ends on a non-zero sample
    // doesn't click/pop.
    const fade = Math.min(0.005, playDuration / 2);
    if (fade > 0) {
      const envEnd = envelopeAt(settings, Math.max(playDuration - fade, 0));
      gain.gain.setValueAtTime(level * envEnd, end - fade);
      gain.gain.linearRampToValueAtTime(0, end);
    }
  }

  return new Voice(
    source,
    gain,
    pan,
    channel,
    instrument,
    settings,
    level,
    when,
    end,
    rate,
    lfo,
    lfoGain,
    group,
  );
}

export interface LoopCache {
  source: number;
  /** Whether the loop was built from the Spectral/Percussion fused render. */
  fused: boolean;
  start: number;
  end: number;
  pingPong: boolean;
  buffer: AudioBuffer;
}

/** Decoded + rendered sample state and the look-ahead sampler voice engine. */
export class SamplerEngine {
  sequence: Sequence | null = null;
  settings: SamplerSettings[] = [];
  samples: Array<AudioBuffer | null> = [];
  clips: Array<AudioClip | null> = [];
  waveforms: Array<Array<[number, number]>> = [];
  fused: Array<AudioBuffer | null> = [];
  fusedClips: Array<AudioClip | null> = [];
  fusedWaveforms: Array<Array<[number, number]>> = [];
  ready = false;
  error: string | null = null;
  loops: Array<LoopCache | null> = [];
  scheduler: Scheduler | null = null;
  voices: Voice[] = [];
  rendering: boolean[] = [];
  private fusionJustCompleted: boolean[] = [];
  private renderGeneration: number[] = [];
  /** Cached reversed copies of effective buffers, keyed by instrument. */
  private reverseCache = new Map<
    number,
    { src: AudioBuffer; rev: AudioBuffer }
  >();

  /** A cached fully-reversed copy of an instrument's effective buffer. */
  reversedBuffer(
    ctx: BaseAudioContext,
    instrument: number,
    buffer: AudioBuffer,
  ): AudioBuffer {
    const cached = this.reverseCache.get(instrument);
    if (cached && cached.src === buffer) return cached.rev;
    const reversed = ctx.createBuffer(
      buffer.numberOfChannels,
      buffer.length,
      buffer.sampleRate,
    );
    for (let c = 0; c < buffer.numberOfChannels; c++) {
      const source = buffer.getChannelData(c);
      const dest = reversed.getChannelData(c);
      for (let i = 0; i < source.length; i++) {
        dest[i] = source[source.length - 1 - i]!;
      }
    }
    this.reverseCache.set(instrument, { src: buffer, rev: reversed });
    return reversed;
  }

  setSequence(sequence: Sequence): void {
    this.sequence = sequence;
  }

  setSettingsVec(settings: SamplerSettings[]): void {
    // Copy the array: `updateSettings` replaces entries in place, and the
    // caller (the Session) keeps its own settings array. Aliasing them let
    // stepthrough previews overwrite the live project settings (BUG-40).
    this.settings = [...settings];
  }

  /**
   * Drops every baked render. Called when the instrument list changes (add /
   * delete / duplicate) so renders cannot be read at a shifted index.
   */
  resetRenders(): void {
    this.reverseCache.clear();
    this.fused = [];
    this.fusedClips = [];
    this.fusedWaveforms = [];
    this.loops = [];
    this.rendering = [];
    this.fusionJustCompleted = [];
    this.renderGeneration = [];
  }

  updateSettings(index: number, settings: SamplerSettings, now: number): void {
    if (settings.muted || settings.sourceIndex === null) {
      for (const voice of this.voices) {
        if (voice.instrument === index && voice.end > now)
          voice.release(now, 0.008);
      }
    }
    this.settings[index] = settings;
  }

  async decodeAll(
    ctx: AudioContext,
    sampleBytes: Array<Uint8Array | null>,
  ): Promise<void> {
    this.samples = [];
    this.clips = [];
    this.waveforms = [];
    this.fused = [];
    this.fusedClips = [];
    this.fusedWaveforms = [];
    this.loops = [];
    this.ready = false;
    try {
      for (const bytes of sampleBytes) {
        if (!bytes || bytes.length === 0) {
          this.samples.push(null);
          this.clips.push(null);
          this.waveforms.push([]);
          continue;
        }
        const arrayBuffer = bytes.buffer.slice(
          bytes.byteOffset,
          bytes.byteOffset + bytes.byteLength,
        ) as ArrayBuffer;
        const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
        this.samples.push(audioBuffer);
        const channelData = audioBuffer.getChannelData(0);
        this.waveforms.push(waveform(channelData, 600));
        const channels: Float32Array[] = [];
        for (let c = 0; c < audioBuffer.numberOfChannels; c++) {
          channels.push(new Float32Array(audioBuffer.getChannelData(c)));
        }
        this.clips.push(audioClip(channels, audioBuffer.sampleRate));
      }
      this.ensureSize(this.settings.length);
      if (spectralWasmAvailable()) {
        const renders: Promise<void>[] = [];
        for (let i = 0; i < this.settings.length; i++) {
          const s = this.settings[i]!;
          if (
            spectralRenderEnabled(s.spectral) &&
            s.sourceIndex !== null &&
            (!this.spectralNeedsB(i) || s.spectral.sourceIndex2 !== null)
          ) {
            renders.push(this.renderSpectral(ctx, i));
          }
        }
        await Promise.allSettled(renders);
      }
      this.ready = true;
    } catch (e) {
      this.error = `Cannot decode source samples: ${String(e)}`;
    }
  }

  private spectralNeedsB(index: number): boolean {
    return this.settings[index]!.spectral.mode !== "off";
  }

  private ensureSize(count: number): void {
    for (let i = this.fused.length; i < count; i++) {
      this.fused.push(null);
      this.fusedClips.push(null);
      this.fusedWaveforms.push([]);
      this.loops.push(null);
      this.rendering.push(false);
      this.fusionJustCompleted.push(false);
      this.renderGeneration.push(0);
    }
  }

  /** Reads and clears the one-shot "a render just finished" flag for an instrument. */
  takeFusionCompleted(instrument: number): boolean {
    const completed = this.fusionJustCompleted[instrument] ?? false;
    this.fusionJustCompleted[instrument] = false;
    return completed;
  }

  async renderSpectral(ctx: AudioContext, instrument: number): Promise<void> {
    const s = this.settings[instrument];
    if (!s) return;
    this.ensureSize(instrument + 1);
    const generation = ++this.renderGeneration[instrument]!;
    if (!spectralRenderEnabled(s.spectral)) {
      // Spectral is off, so `spectralActive` already makes `effectiveClip`
      // fall back to the plain sample. Keep any fused clip as a cache instead
      // of clearing it: the stepthrough previews temporarily set blank
      // (spectral-off) settings, and clearing here left the live instruments
      // silent after exiting (BUG-40).
      return;
    }
    // Keep the previous fused clip audible while the new render runs; it is
    // replaced on success. Nulling it here left instruments silent during every
    // re-render (e.g. on stepthrough exit — BUG-40).
    this.rendering[instrument] = true;
    try {
      const source = s.sourceIndex;
      if (source === null) throw new Error("Sample A is required");
      const a = this.clips[source];
      if (!a) throw new Error("Sample A is not ready");
      const b =
        s.spectral.sourceIndex2 !== null
          ? (this.clips[s.spectral.sourceIndex2] ?? null)
          : null;
      const clip = await spectralRender(a, b, s.spectral);
      if (this.renderGeneration[instrument] !== generation) return; // superseded by a newer render
      const buffer = ctx.createBuffer(
        clip.channels.length,
        clip.channels[0]!.length,
        clip.sampleRate,
      );
      for (let c = 0; c < clip.channels.length; c++) {
        buffer.getChannelData(c).set(clip.channels[c]!);
      }
      this.fused[instrument] = buffer;
      this.fusedClips[instrument] = clip;
      this.fusedWaveforms[instrument] = waveform(clip.channels[0]!, 600);
      // The fused loop is this instrument's effective source, so play its full
      // length. Without this the old sampler trim (e.g. a 0.44s slice of sample
      // A) would cut the rendered 4s loop off early. Percussion renders are
      // one-shots, so honour `spectral.oneShot` instead of always looping.
      s.startSec = 0;
      s.endSec = buffer.duration;
      s.looping = !s.spectral.oneShot;
      this.fusionJustCompleted[instrument] = true;
    } catch (e) {
      if (this.renderGeneration[instrument] !== generation) return; // superseded, ignore its error too
      this.error = `Cannot render Spectral instrument: ${String(e)}`;
    } finally {
      if (this.renderGeneration[instrument] === generation)
        this.rendering[instrument] = false;
    }
  }

  private spectralActive(instrument: number): boolean {
    const s = this.settings[instrument];
    return !!s && spectralRenderEnabled(s.spectral) && spectralWasmAvailable();
  }

  buffer(ctx: AudioContext, instrument: number): AudioBuffer {
    const settings = this.settings[instrument];
    if (!settings) throw new Error("No instrument settings");
    const source = settings.sourceIndex;
    if (source === null) throw new Error("Sample is not assigned");
    const active = this.spectralActive(instrument);
    const original = active ? this.fused[instrument] : this.samples[source];
    if (!original) throw new Error("Sample is not ready");
    const reg = region(settings, original.duration);
    if (!reg) throw new Error("Empty trim");
    const [start, length] = reg;
    if (!settings.looping) return original;

    const cache = this.loops[instrument];
    if (
      cache &&
      cache.source === source &&
      cache.fused === active &&
      cache.start === start &&
      cache.end === start + length &&
      cache.pingPong === settings.pingPong
    ) {
      return cache.buffer;
    }

    const channels: Float32Array[] = [];
    for (let c = 0; c < original.numberOfChannels; c++) {
      channels.push(
        loopChannel(
          original.getChannelData(c),
          original.sampleRate,
          start,
          start + length,
          settings.pingPong,
        ),
      );
    }
    const buffer = ctx.createBuffer(
      original.numberOfChannels,
      channels[0]!.length,
      original.sampleRate,
    );
    for (let c = 0; c < channels.length; c++)
      buffer.getChannelData(c).set(channels[c]!);
    this.loops[instrument] = {
      source,
      fused: active,
      start,
      end: start + length,
      pingPong: settings.pingPong,
      buffer,
    };
    return buffer;
  }

  tick(ctx: AudioContext, channelGains: Array<GainNode | null>): void {
    const now = ctx.currentTime;
    for (let i = this.voices.length - 1; i >= 0; i--) {
      const voice = this.voices[i]!;
      if (voice.end <= now) {
        voice.dispose();
        this.voices.splice(i, 1);
      }
    }
    const scheduler = this.scheduler;
    const sequence = this.sequence;
    if (!scheduler || !sequence) return;

    for (const scheduled of scheduler.tick(now, LOOKAHEAD_SEC)) {
      const events = sequence.rows[scheduled.row] ?? [];
      for (const event of events) {
        this.handleEvent(ctx, channelGains, event, scheduled.when, now);
      }
    }
  }

  private findLastVoice(channel: number, when: number): Voice | undefined {
    for (let i = this.voices.length - 1; i >= 0; i--) {
      const voice = this.voices[i]!;
      if (voice.channel === channel && voice.end > when && !voice.stolen)
        return voice;
    }
    return undefined;
  }

  private handleEvent(
    ctx: AudioContext,
    channelGains: Array<GainNode | null>,
    event: SamplerEvent,
    when: number,
    now: number,
  ): void {
    if (event.type === "off") {
      // Release every voice on the channel, so all chord tones stop together.
      // `choke` instruments skip the release and cut immediately.
      for (const voice of this.voices) {
        if (
          voice.channel === event.channel &&
          voice.end > when &&
          !voice.stolen
        ) {
          if (voice.settings.choke) voice.cut(when);
          else
            voice.release(
              when,
              Math.min(Math.max(voice.settings.release, 0), 5),
            );
        }
      }
      return;
    }
    if (event.type === "pitchRamp") {
      const voice = this.findLastVoice(event.channel, when);
      if (voice) voice.pitchRamp(event.rate, when, event.duration);
      return;
    }

    const settings = this.settings[event.instrument];
    if (!settings || settings.muted || settings.sourceIndex === null) return;
    let buffer: AudioBuffer;
    try {
      buffer = this.buffer(ctx, event.instrument);
    } catch (e) {
      this.error = `Cannot play sample: ${String(e)}`;
      return;
    }

    const group = event.voiceGroup;
    if (settings.polyphonic) {
      const cap = Math.min(Math.max(settings.voiceCap, 1), 32);
      const active = () =>
        this.voices.filter(
          (v) => v.instrument === event.instrument && v.end > when && !v.stolen,
        );
      const candidates = () =>
        active().filter((v) => group === undefined || v.group !== group);
      while (active().length >= cap && candidates().length > 0) {
        const victim = candidates()[0];
        if (!victim) break;
        victim.release(when, 0.008);
        victim.stolen = true;
      }
    } else {
      // Release the previous note/chord on this channel, but never the other
      // tones of the chord currently being scheduled.
      for (const voice of this.voices) {
        if (
          voice.channel !== event.channel ||
          voice.end <= when ||
          voice.stolen
        )
          continue;
        if (group !== undefined && voice.group === group) continue;
        if (voice.settings.choke) voice.cut(when);
        else voice.release(when, 0.008);
        voice.stolen = true;
      }
    }

    const destination = channelGains[event.channel] ?? ctx.destination;
    const playBuffer = event.reverse
      ? this.reversedBuffer(ctx, event.instrument, buffer)
      : buffer;
    try {
      const voice = buildVoice(
        ctx,
        playBuffer,
        settings,
        event.instrument,
        event.channel,
        event.rate,
        event.volume,
        when + (event.delaySec ?? 0),
        destination,
        event.panOffset ?? 0,
        group,
        event.offsetFraction ?? 0,
        event.reverse ?? false,
        event.detuneCents ?? 0,
        event.hold ?? false,
      );
      this.voices.push(voice);
    } catch (e) {
      this.error = `Cannot play sample: ${String(e)}`;
    }
    void now;
  }

  playheads(now: number): SamplePlayhead[] {
    const out: SamplePlayhead[] = [];
    for (const voice of this.voices) {
      const ph = voice.playhead(now);
      if (ph) out.push(ph);
    }
    return out;
  }

  clear(): void {
    for (const voice of this.voices) voice.dispose();
    this.voices = [];
    this.scheduler = null;
  }

  effectiveWaveform(instrument: number): Array<[number, number]> {
    const s = this.settings[instrument];
    if (!s) return [];
    if (this.spectralActive(instrument))
      return this.fusedWaveforms[instrument] ?? [];
    const src = s.sourceIndex;
    return src !== null ? (this.waveforms[src] ?? []) : [];
  }

  effectiveClip(instrument: number): AudioClip | null {
    const s = this.settings[instrument];
    if (!s) return null;
    if (this.spectralActive(instrument))
      return this.fusedClips[instrument] ?? null;
    const src = s.sourceIndex;
    return src !== null ? (this.clips[src] ?? null) : null;
  }

  effectiveDuration(instrument: number): number {
    const s = this.settings[instrument];
    if (!s) return 0;
    if (this.spectralActive(instrument)) {
      const buf = this.fused[instrument];
      return buf ? buf.duration : 0;
    }
    const src = s.sourceIndex;
    const buf = src !== null ? this.samples[src] : null;
    return buf ? buf.duration : 0;
  }

  /** Drops and rebuilds loop caches for all instruments. */
  invalidateLoops(): void {
    this.loops = this.loops.map(() => null);
  }

  clipsForPackaging(index: number): AudioClip | null {
    return this.clips[index] ?? null;
  }

  fusedReady(instrument: number): boolean {
    return this.fused[instrument] != null;
  }
}

export { clipDuration };
