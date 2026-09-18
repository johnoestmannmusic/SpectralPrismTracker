import { A_REF_NOTE } from "./pitch";
import {
  CHORD_PRESETS,
  defaultChordSettings,
  defaultSamplerSettings,
  type ChordPreset,
  type ChordSettings,
  type SamplerSettings,
} from "./sampler";
import type { NoteValue, PatternCell } from "./songTypes";
import {
  PERCUSSION_NOISE_COLORS,
  PERCUSSION_PRESETS,
  SPECTRAL_FUSION_MODES,
  SPECTRAL_MOD_SHAPES,
  SPECTRAL_PARAMS,
  defaultMicroTextureSettings,
  defaultPercussionSettings,
  defaultSpectralSettings,
  percussionPreset,
  type MicroTextureSettings,
  type PercussionNoiseColor,
  type PercussionSettings,
  type SpectralModRoute,
  type SpectralModShape,
  type SpectralParamId,
  type SpectralSettings,
} from "./spectral";
import {
  retime,
  type PatternSnapshot,
  type PatternTuple,
  type SongModel,
} from "./songModel";
import { clampBpm } from "./timing";
import {
  defaultMasterFx,
  masterFxFromJson,
  type MasterFxSettings,
} from "./masterFx";

export interface SourceSampleRef {
  name: string;
  url: string | null;
  comments: string;
  dataUrl?: string | null;
}

export interface ProjectFile {
  version: number;
  channelVolume: number[];
  masterVolume: number;
  mutedChannels: boolean[];
  mutedInstruments: boolean[];
  refPitchEnabled: boolean;
  sourceSamples: Array<SourceSampleRef | null>;
  instruments: SamplerSettings[];
  /** Display names for the instruments (not part of the pattern data). */
  instrumentNames: string[];
  songTitle: string;
  artist: string;
  album: string;
  comments: string;
  musicLicense: string;
  codeLicense: string;
  viewSourceLink: string;
  websiteLink: string;
  theme: string;
  /** Master output effects (delay + reverb). */
  masterFx: MasterFxSettings;
  patternSnapshot?: PatternSnapshot | null;
  /** Tempo in beats per minute. Absent in legacy projects (migrated on load). */
  bpmOverride?: number | null;
  highlightAOverride?: number | null;
  highlightBOverride?: number | null;
}

export function defaultProject(): ProjectFile {
  return {
    version: 1,
    channelVolume: [1, 1, 1, 1],
    masterVolume: 1,
    mutedChannels: [false, false, false, false],
    mutedInstruments: [],
    refPitchEnabled: false,
    sourceSamples: Array.from({ length: 6 }, () => null),
    instruments: [],
    instrumentNames: [],
    songTitle: "",
    artist: "",
    album: "",
    comments: "",
    musicLicense: "",
    codeLicense: "",
    viewSourceLink: "",
    websiteLink: "",
    theme: "system",
    masterFx: defaultMasterFx(),
    patternSnapshot: null,
    bpmOverride: null,
    highlightAOverride: null,
    highlightBOverride: null,
  };
}

// ---- NoteValue serde compatibility (Rust derived serde representation) ----

export function noteToSerde(note: NoteValue): unknown {
  switch (note.kind) {
    case "note":
      return { Note: note.note };
    case "off":
      return "Off";
    case "release":
      return "Release";
    case "macroRelease":
      return "MacroRelease";
    case "rawFreq":
      return { RawFreq: note.value };
  }
}

export function noteFromSerde(value: unknown): NoteValue | null {
  if (value === "Off") return { kind: "off" };
  if (value === "Release") return { kind: "release" };
  if (value === "MacroRelease") return { kind: "macroRelease" };
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    if (typeof obj.Note === "number") return { kind: "note", note: obj.Note };
    if (typeof obj.RawFreq === "number")
      return { kind: "rawFreq", value: obj.RawFreq };
  }
  return null;
}

function cellToSerde(cell: PatternCell): unknown {
  return {
    note: cell.note ? noteToSerde(cell.note) : null,
    instrument: cell.instrument,
    volume: cell.volume,
    effects: cell.effects.map((e) => ({ effect: e.effect, value: e.value })),
  };
}

function cellFromSerde(value: unknown): PatternCell {
  const obj = (value ?? {}) as Record<string, unknown>;
  const effectsRaw = Array.isArray(obj.effects) ? obj.effects : [];
  const effects = effectsRaw.map((e) => {
    const slot = (e ?? {}) as Record<string, unknown>;
    return {
      effect: typeof slot.effect === "number" ? slot.effect : null,
      value: typeof slot.value === "number" ? slot.value : null,
    };
  });
  while (effects.length < 8) effects.push({ effect: null, value: null });
  return {
    note: noteFromSerde(obj.note),
    instrument: typeof obj.instrument === "number" ? obj.instrument : null,
    volume: typeof obj.volume === "number" ? obj.volume : null,
    effects,
  };
}

function cellIsEmpty(cell: PatternCell): boolean {
  return (
    cell.note === null &&
    cell.instrument === null &&
    cell.volume === null &&
    cell.effects.every((e) => e.effect === null && e.value === null)
  );
}

export function snapshotToSerde(
  snapshot: PatternSnapshot | null | undefined,
): unknown {
  if (!snapshot) return null;
  return {
    orderLength: snapshot.orderLength,
    channels: snapshot.channels.map((channel) => ({
      orderLength: channel.orderLength ?? channel.orderList.length,
      orderList: channel.orderList,
      phaseOffsetRows: channel.phaseOffsetRows ?? 0,
      speed: channel.speed ?? 1,
      detuneDriftCents: channel.detuneDriftCents ?? 0,
      detuneDriftRate: channel.detuneDriftRate ?? 0.2,
      // Sparse rows: only cells that actually contain something are written,
      // as [rowIndex, cell] pairs. Empty patterns collapse to `[]`.
      // Format: [index, sparse, rowLength?, name?] — trailing optionals keep
      // legacy two-element entries loadable.
      patterns: channel.patterns.map(([index, rows, rowLength, name]) => {
        const sparse: unknown[] = [];
        rows.forEach((cell, row) => {
          if (!cellIsEmpty(cell)) sparse.push([row, cellToSerde(cell)]);
        });
        const entry: unknown[] = [index, sparse];
        if (typeof rowLength === "number") entry.push(rowLength);
        if (name) entry.push(name);
        return entry;
      }),
    })),
  };
}

export function snapshotFromSerde(value: unknown): PatternSnapshot | null {
  if (!value || typeof value !== "object") return null;
  const obj = value as Record<string, unknown>;
  const channelsRaw = Array.isArray(obj.channels) ? obj.channels : [];
  return {
    orderLength: typeof obj.orderLength === "number" ? obj.orderLength : 0,
    channels: channelsRaw.map((channelRaw) => {
      const channel = (channelRaw ?? {}) as Record<string, unknown>;
      const patternsRaw = Array.isArray(channel.patterns)
        ? channel.patterns
        : [];
      const orderList = Array.isArray(channel.orderList)
        ? (channel.orderList as number[])
        : [];
      // The order list is the source of truth; `orderLength` is read for
      // forward-compatibility but clamped to the list we actually have.
      const storedLength =
        typeof channel.orderLength === "number" && channel.orderLength > 0
          ? Math.min(channel.orderLength, orderList.length)
          : orderList.length;
      return {
        orderLength: storedLength,
        orderList,
        phaseOffsetRows:
          typeof channel.phaseOffsetRows === "number"
            ? channel.phaseOffsetRows
            : 0,
        speed: typeof channel.speed === "number" ? channel.speed : 1,
        detuneDriftCents:
          typeof channel.detuneDriftCents === "number"
            ? channel.detuneDriftCents
            : 0,
        detuneDriftRate:
          typeof channel.detuneDriftRate === "number"
            ? channel.detuneDriftRate
            : 0.2,
        patterns: patternsRaw.map((pair) => {
          const tuple = pair as [number, unknown, unknown?, unknown?];
          const [index, second] = tuple;
          const hasLength = typeof tuple[2] === "number";
          const rows = second;
          const rowLength = hasLength ? (tuple[2] as number) : undefined;
          const name =
            typeof tuple[3] === "string" ? (tuple[3] as string) : undefined;
          const list = (rows as unknown[]) ?? [];
          const first = list[0];
          const sparse =
            Array.isArray(first) && typeof (first as unknown[])[0] === "number";
          if (sparse) {
            const cells: PatternCell[] = [];
            for (const entry of list as Array<[number, unknown]>) {
              cells[entry[0]] = cellFromSerde(entry[1]);
            }
            for (let i = 0; i < cells.length; i++) {
              if (!cells[i]) cells[i] = cellFromSerde(null);
            }
            return [index, cells, rowLength, name] as PatternTuple;
          }
          return [
            index,
            list.map(cellFromSerde),
            rowLength,
            name,
          ] as PatternTuple;
        }),
      };
    }),
  };
}

// ---- Sampler / spectral settings JSON mapping ----

/** Legacy pre-prism_dsp Fusion mode keys that map onto a current mode. */
const LEGACY_MODE_ALIASES: Record<string, SpectralSettings["mode"]> = {
  "spectral-blend": "cross-synth",
};

function modRoutesFromJson(value: unknown): SpectralModRoute[] {
  if (!Array.isArray(value)) return [];
  const validTargets = new Set<string>(SPECTRAL_PARAMS.map((p) => p.id));
  const validShapes = new Set<string>(SPECTRAL_MOD_SHAPES);
  const routes: SpectralModRoute[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const obj = raw as Record<string, unknown>;
    if (typeof obj.target !== "string" || !validTargets.has(obj.target))
      continue;
    routes.push({
      target: obj.target as SpectralParamId,
      shape:
        typeof obj.shape === "string" && validShapes.has(obj.shape)
          ? (obj.shape as SpectralModShape)
          : "lfo",
      depth: typeof obj.depth === "number" ? obj.depth : 0,
      rateHz: typeof obj.rateHz === "number" ? obj.rateHz : 1,
      phase: typeof obj.phase === "number" ? obj.phase : 0,
      bipolar: typeof obj.bipolar === "boolean" ? obj.bipolar : true,
    });
  }
  return routes;
}

function percussionFromJson(value: unknown): PercussionSettings {
  const d = defaultPercussionSettings();
  if (!value || typeof value !== "object") return d;
  const obj = value as Record<string, unknown>;
  const num = (key: string, fallback: number) =>
    typeof obj[key] === "number" ? (obj[key] as number) : fallback;
  const color =
    typeof obj.noiseColor === "string" &&
    (PERCUSSION_NOISE_COLORS as string[]).includes(obj.noiseColor)
      ? (obj.noiseColor as PercussionNoiseColor)
      : d.noiseColor;
  return {
    enabled: typeof obj.enabled === "boolean" ? obj.enabled : d.enabled,
    noiseAmount: num("noiseAmount", d.noiseAmount),
    noiseColor: color,
    noiseDecay: num("noiseDecay", d.noiseDecay),
    transientAmount: num("transientAmount", d.transientAmount),
    transientDecay: num("transientDecay", d.transientDecay),
    transientFrequency: num("transientFrequency", d.transientFrequency),
    pitchStart: num("pitchStart", d.pitchStart),
    pitchEnd: num("pitchEnd", d.pitchEnd),
    pitchDecay: num("pitchDecay", d.pitchDecay),
    ampDecay: num("ampDecay", d.ampDecay),
    bodyAmount: num("bodyAmount", d.bodyAmount),
    partialCount: num("partialCount", d.partialCount),
    partialDecay: num("partialDecay", d.partialDecay),
    digitalAmount: num("digitalAmount", d.digitalAmount),
    driveAmount: num("driveAmount", d.driveAmount),
    compressAmount: num("compressAmount", d.compressAmount),
    stereoWidth: num("stereoWidth", d.stereoWidth),
    lengthSeconds: num("lengthSeconds", d.lengthSeconds),
  };
}

/** Applies a named percussion preset, preserving the current enable flag. */
export function applyPercussionPreset(
  settings: SpectralSettings,
  preset: (typeof PERCUSSION_PRESETS)[number],
  enabled = settings.percussion.enabled,
): PercussionSettings {
  return { ...percussionPreset(preset), enabled };
}

function microTexturesFromJson(value: unknown): MicroTextureSettings {
  const d = defaultMicroTextureSettings();
  if (!value || typeof value !== "object") return d;
  const obj = value as Record<string, unknown>;
  const num = (key: string, fallback: number) =>
    typeof obj[key] === "number" ? (obj[key] as number) : fallback;
  return {
    enabled: typeof obj.enabled === "boolean" ? obj.enabled : d.enabled,
    grainSeconds: num("grainSeconds", d.grainSeconds),
    densityHz: num("densityHz", d.densityHz),
    jitter: num("jitter", d.jitter),
    reverseProbability: num("reverseProbability", d.reverseProbability),
    pitchScatter: num("pitchScatter", d.pitchScatter),
    panScatter: num("panScatter", d.panScatter),
    volumeVariance: num("volumeVariance", d.volumeVariance),
    densityModRate: num("densityModRate", d.densityModRate),
    densityModDepth: num("densityModDepth", d.densityModDepth),
    grainChaos: num("grainChaos", d.grainChaos),
    retriggerHz: num("retriggerHz", d.retriggerHz),
    retriggerAmount: num("retriggerAmount", d.retriggerAmount),
    bitDepth: num("bitDepth", d.bitDepth),
    downsample: num("downsample", d.downsample),
    formantShift: num("formantShift", d.formantShift),
    formantResonance: num("formantResonance", d.formantResonance),
    formantMix: num("formantMix", d.formantMix),
  };
}

function chordFromJson(value: unknown): ChordSettings {
  const d = defaultChordSettings();
  if (!value || typeof value !== "object") return d;
  const obj = value as Record<string, unknown>;
  const preset =
    typeof obj.preset === "string" &&
    (CHORD_PRESETS as string[]).includes(obj.preset)
      ? (obj.preset as ChordPreset)
      : d.preset;
  const intervals = Array.isArray(obj.intervals)
    ? obj.intervals
        .filter((n): n is number => typeof n === "number" && Number.isFinite(n))
        .slice(0, 16)
    : d.intervals;
  const num = (key: string, fallback: number) =>
    typeof obj[key] === "number" ? (obj[key] as number) : fallback;
  return {
    enabled: typeof obj.enabled === "boolean" ? obj.enabled : d.enabled,
    preset,
    intervals: intervals.length > 0 ? intervals : d.intervals,
    inversion: num("inversion", d.inversion),
    octaves: num("octaves", d.octaves),
    detuneCents: num("detuneCents", d.detuneCents),
    strumSec: num("strumSec", d.strumSec),
    panSpread: num("panSpread", d.panSpread),
    voiceCap: num("voiceCap", d.voiceCap),
  };
}

function spectralFromJson(value: unknown): SpectralSettings {
  const d = defaultSpectralSettings();
  if (!value || typeof value !== "object") return d;
  const obj = value as Record<string, unknown>;
  const num = (key: string, fallback: number) =>
    typeof obj[key] === "number" ? (obj[key] as number) : fallback;
  const rawMode =
    typeof obj.mode === "string"
      ? obj.mode
      : typeof obj.algorithm === "string"
        ? obj.algorithm
        : d.mode;
  const aliased = LEGACY_MODE_ALIASES[rawMode] ?? rawMode;
  const mode = (SPECTRAL_FUSION_MODES as string[]).includes(aliased)
    ? (aliased as SpectralSettings["mode"])
    : "off";
  return {
    enabled: typeof obj.enabled === "boolean" ? obj.enabled : d.enabled,
    sourceIndex2:
      typeof obj.sourceIndex2 === "number" ? obj.sourceIndex2 : null,
    mode,
    freezePoint: num("freezePoint", d.freezePoint),
    freezePointB: num("freezePointB", d.freezePointB),
    tune: num("tune", d.tune),
    tuneB: num("tuneB", d.tuneB),
    formantShift: num("formantShift", d.formantShift),
    formantShiftB: num("formantShiftB", d.formantShiftB),
    volume: num("volume", d.volume),
    volumeB: num("volumeB", d.volumeB),
    mixAmount: num("mixAmount", d.mixAmount),
    crossSynthAmount: num("crossSynthAmount", d.crossSynthAmount),
    convolveAmount: num("convolveAmount", d.convolveAmount),
    ringModAmount: num("ringModAmount", d.ringModAmount),
    stereoWidth: num("stereoWidth", d.stereoWidth),
    loopLengthSeconds: num("loopLengthSeconds", d.loopLengthSeconds),
    modulation: modRoutesFromJson(obj.modulation),
    percussion: percussionFromJson(obj.percussion),
    microTextures: microTexturesFromJson(obj.microTextures),
    oneShot: typeof obj.oneShot === "boolean" ? obj.oneShot : d.oneShot,
    savedStartSec: num("savedStartSec", d.savedStartSec),
    savedEndSec: num("savedEndSec", d.savedEndSec),
    savedLooping:
      typeof obj.savedLooping === "boolean" ? obj.savedLooping : d.savedLooping,
  };
}

export function samplerFromJson(value: unknown): SamplerSettings {
  const d = defaultSamplerSettings();
  if (!value || typeof value !== "object") return d;
  const obj = value as Record<string, unknown>;
  const num = (key: string, fallback: number) =>
    typeof obj[key] === "number" ? (obj[key] as number) : fallback;
  const bool = (key: string, fallback: boolean) =>
    typeof obj[key] === "boolean" ? (obj[key] as boolean) : fallback;
  return {
    sourceIndex: typeof obj.sourceIndex === "number" ? obj.sourceIndex : null,
    startSec: num("startSec", d.startSec),
    endSec: num("endSec", d.endSec),
    transpose: num("transpose", d.transpose),
    volume: num("volume", d.volume),
    looping: bool("loop", d.looping),
    pingPong: bool("pingPong", d.pingPong),
    attack: num("attack", d.attack),
    decay: num("decay", d.decay),
    sustain: num("sustain", d.sustain),
    release: num("release", d.release),
    pan: num("pan", d.pan),
    panRandomRange: num("panRandomRange", d.panRandomRange),
    vibratoSpeed: num("vibratoSpeed", d.vibratoSpeed),
    vibratoDepth: num("vibratoDepth", d.vibratoDepth),
    polyphonic: bool("polyphonic", d.polyphonic),
    voiceCap: num("voiceCap", d.voiceCap),
    choke: bool("choke", d.choke),
    spectral: spectralFromJson(obj.spectral ?? obj.spectralFusion),
    chord: chordFromJson(obj.chord),
    muted: false,
  };
}

export function samplerToJson(
  settings: SamplerSettings,
  includeMuted = false,
): Record<string, unknown> {
  const out: Record<string, unknown> = {
    sourceIndex: settings.sourceIndex,
    startSec: settings.startSec,
    endSec: settings.endSec,
    transpose: settings.transpose,
    volume: settings.volume,
    loop: settings.looping,
    pingPong: settings.pingPong,
    attack: settings.attack,
    decay: settings.decay,
    sustain: settings.sustain,
    release: settings.release,
    pan: settings.pan,
    panRandomRange: settings.panRandomRange,
    vibratoSpeed: settings.vibratoSpeed,
    vibratoDepth: settings.vibratoDepth,
    polyphonic: settings.polyphonic,
    voiceCap: settings.voiceCap,
    choke: settings.choke,
    spectral: settings.spectral,
    chord: settings.chord,
  };
  if (includeMuted) out.muted = settings.muted;
  return out;
}

function sourceSampleFromJson(value: unknown): SourceSampleRef | null {
  if (!value || typeof value !== "object") return null;
  const obj = value as Record<string, unknown>;
  return {
    name: typeof obj.name === "string" ? obj.name : "",
    url: typeof obj.url === "string" ? obj.url : null,
    comments: typeof obj.comments === "string" ? obj.comments : "",
    dataUrl: typeof obj.dataUrl === "string" ? obj.dataUrl : null,
  };
}

/** Parses JSON, applying the legacy `rootNote` -> `transpose` migration. */
export function projectFromJson(text: string): ProjectFile {
  let value: Record<string, unknown>;
  try {
    value = JSON.parse(text) as Record<string, unknown>;
  } catch (e) {
    throw new Error(`Invalid Project JSON: ${String(e)}`, { cause: e });
  }
  return projectFromValue(value);
}

export function projectFromValue(value: Record<string, unknown>): ProjectFile {
  const base = defaultProject();

  const instrumentsRaw = Array.isArray(value.instruments)
    ? value.instruments
    : [];
  const instruments = instrumentsRaw.map((raw) => {
    if (raw && typeof raw === "object") {
      const obj = raw as Record<string, unknown>;
      if (obj.transpose === undefined && typeof obj.rootNote === "number") {
        obj.transpose = A_REF_NOTE - obj.rootNote;
      }
      delete obj.rootNote;
    }
    return samplerFromJson(raw);
  });

  const sourceSamplesRaw = Array.isArray(value.sourceSamples)
    ? value.sourceSamples
    : [];
  const sourceSamples: Array<SourceSampleRef | null> = Array.from(
    { length: 6 },
    (_, i) => sourceSampleFromJson(sourceSamplesRaw[i]),
  );

  const arr = <T>(v: unknown, fallback: T[]): T[] =>
    Array.isArray(v) ? (v as T[]) : fallback;
  const str = (key: string, fallback: string) =>
    typeof value[key] === "string" ? (value[key] as string) : fallback;
  const num = (key: string, fallback: number) =>
    typeof value[key] === "number" ? (value[key] as number) : fallback;

  let virtualTempo: [number, number] | null = null;
  if (
    Array.isArray(value.virtualTempoOverride) &&
    value.virtualTempoOverride.length === 2
  ) {
    const [a, b] = value.virtualTempoOverride as number[];
    virtualTempo = [a as number, b as number];
  }

  const numOrNull = (key: string): number | null =>
    typeof value[key] === "number" ? (value[key] as number) : null;
  const highlightAOverride = numOrNull("highlightAOverride");
  const highlightBOverride = numOrNull("highlightBOverride");
  // Legacy projects stored a tick rate + speed + virtual tempo; collapse those
  // into one BPM so row duration is preserved (bpm = 60 / (rowDur * beat)).
  let bpmOverride = numOrNull("bpmOverride");
  if (bpmOverride === null) {
    const legacyTickRate = numOrNull("tickRateOverride");
    const legacySpeed = numOrNull("speedOverride");
    if (legacyTickRate !== null || legacySpeed !== null) {
      const tickRate = legacyTickRate ?? 60;
      const speed = legacySpeed ?? 6;
      const beat = highlightAOverride ?? 4;
      const virtualNum = Math.max(virtualTempo?.[0] ?? 1, 1);
      const virtualDen = Math.max(virtualTempo?.[1] ?? 1, 1);
      bpmOverride = clampBpm(
        (60 * tickRate * virtualNum) /
          (Math.max(speed, 1) * virtualDen * Math.max(beat, 1)),
      );
    }
  }

  return {
    ...base,
    version: num("version", 1),
    channelVolume: arr<number>(value.channelVolume, [1, 1, 1, 1]).slice(0, 4),
    masterVolume: num("masterVolume", 1),
    mutedChannels: arr<boolean>(value.mutedChannels, [
      false,
      false,
      false,
      false,
    ]).slice(0, 4),
    mutedInstruments: arr<boolean>(value.mutedInstruments, []),
    refPitchEnabled:
      typeof value.refPitchEnabled === "boolean"
        ? value.refPitchEnabled
        : false,
    sourceSamples,
    instruments,
    instrumentNames: arr<unknown>(value.instrumentNames, []).map((n) =>
      String(n),
    ),
    songTitle: str("songTitle", ""),
    artist: str("artist", ""),
    album: str("album", ""),
    comments: str("comments", ""),
    musicLicense: str("musicLicense", ""),
    codeLicense: str("codeLicense", ""),
    viewSourceLink: str("viewSourceLink", ""),
    websiteLink: str("websiteLink", ""),
    theme: str("theme", "system"),
    masterFx: masterFxFromJson(value.masterFx),
    patternSnapshot: snapshotFromSerde(value.patternSnapshot),
    bpmOverride,
    highlightAOverride,
    highlightBOverride,
  };
}

export function projectToJson(project: ProjectFile, pretty = false): string {
  const value = projectToValue(project);
  return pretty ? JSON.stringify(value, null, 2) : JSON.stringify(value);
}

export function projectToValue(project: ProjectFile): Record<string, unknown> {
  const value: Record<string, unknown> = {
    version: project.version,
    channelVolume: project.channelVolume,
    masterVolume: project.masterVolume,
    refPitchEnabled: project.refPitchEnabled,
    instruments: project.instruments.map((s) => samplerToJson(s, false)),
    theme: project.theme,
    masterFx: project.masterFx,
  };
  if (project.instrumentNames.some((n) => n))
    value.instrumentNames = project.instrumentNames;
  if (project.mutedChannels.some(Boolean))
    value.mutedChannels = project.mutedChannels;
  if (project.mutedInstruments.some(Boolean))
    value.mutedInstruments = project.mutedInstruments;
  if (project.sourceSamples.some((s) => s !== null))
    value.sourceSamples = project.sourceSamples;
  if (project.songTitle) value.songTitle = project.songTitle;
  if (project.artist) value.artist = project.artist;
  if (project.album) value.album = project.album;
  if (project.comments) value.comments = project.comments;
  if (project.musicLicense) value.musicLicense = project.musicLicense;
  if (project.codeLicense) value.codeLicense = project.codeLicense;
  if (project.viewSourceLink) value.viewSourceLink = project.viewSourceLink;
  if (project.websiteLink) value.websiteLink = project.websiteLink;
  if (project.patternSnapshot)
    value.patternSnapshot = snapshotToSerde(project.patternSnapshot);
  if (project.bpmOverride != null) value.bpmOverride = project.bpmOverride;
  if (project.highlightAOverride != null)
    value.highlightAOverride = project.highlightAOverride;
  if (project.highlightBOverride != null)
    value.highlightBOverride = project.highlightBOverride;
  return value;
}

export function validateProject(
  project: ProjectFile,
  instrumentCount: number,
): void {
  if (project.version !== 1) {
    throw new Error(`Unsupported Project JSON version ${project.version}`);
  }
  if (project.instruments.length === 0) {
    throw new Error("Project JSON has no instrument settings");
  }
  if (project.instruments.length > instrumentCount) {
    throw new Error(
      `Project has ${project.instruments.length} instruments but this song has ${instrumentCount}`,
    );
  }
  if (
    !Number.isFinite(project.masterVolume) ||
    project.channelVolume.some((v) => !Number.isFinite(v))
  ) {
    throw new Error("Project mixer values must be finite numbers");
  }
  if (!["system", "light", "dark"].includes(project.theme)) {
    throw new Error("Project theme must be system, light, or dark");
  }
}

export function applyTimingOverrides(
  project: ProjectFile,
  song: SongModel,
): void {
  let changed = false;
  if (project.bpmOverride != null) {
    song.meta.bpm = clampBpm(project.bpmOverride);
    changed = true;
  }
  if (project.highlightAOverride != null) {
    song.meta.highlightA = project.highlightAOverride;
    changed = true;
  }
  if (project.highlightBOverride != null) {
    song.meta.highlightB = project.highlightBOverride;
    changed = true;
  }
  if (changed) {
    retime(song);
  }
}
