import type { PatternCell } from "./songTypes";
import { defaultMasterFx, type MasterFxSettings } from "./masterFx";
import type { ProjectFile } from "./project";
import { defaultSamplerSettings, type SamplerSettings } from "./sampler";
import { applyEdit, type SongModel } from "./songModel";
import {
  defaultSpectralSettings,
  spectralModeHasAmount,
  spectralModeNeedsB,
} from "./spectral";
import { FX_CATALOG } from "./tracker";

/**
 * Stepthrough: a machine-readable recipe describing how a project is built.
 *
 * `buildSteps` reads a finished project and synthesises an ordered list of
 * steps (only where a value differs from its default). `applyBuildStep` mutates
 * a `BuildTarget` in place, so the same recipe can drive the progressive UI
 * preview here and (later) an automation/script runner. Framework-agnostic:
 * no Ink, no audio.
 */

export type StepScreen =
  | "song"
  | "samples"
  | "instruments"
  | "sampler"
  | "spectral"
  | "percussion"
  | "mixer"
  | "master-fx"
  | "patterns"
  | "tracker";

export interface StepHighlight {
  kind:
    "param" | "cell" | "row" | "order" | "channel" | "sample" | "instrument";
  /** Param group title (param highlights). */
  group?: string;
  /** Param label (param highlights). */
  label?: string;
  instrument?: number;
  order?: number;
  row?: number;
  channel?: number;
  slot?: number;
}

export type StepAction =
  | {
      kind: "songMeta";
      field: "songTitle" | "artist" | "album" | "comments";
      value: string;
    }
  | {
      kind: "timing";
      tickRate?: number;
      speed?: number;
      highlightA?: number;
      highlightB?: number;
    }
  | { kind: "sampleName"; slot: number; name: string; comments?: string }
  | { kind: "instrumentName"; instrument: number; name: string }
  | { kind: "instrumentSource"; instrument: number; sourceIndex: number | null }
  | {
      kind: "instrumentParam";
      instrument: number;
      field: keyof SamplerSettings;
      value: number | boolean;
    }
  | {
      kind: "spectralParam";
      instrument: number;
      field: string;
      value: number | boolean | string | null;
    }
  | {
      kind: "percussionParam";
      instrument: number;
      field: string;
      value: number | boolean;
    }
  | { kind: "channelVolume"; channel: number; value: number }
  | { kind: "channelMute"; channel: number; muted: boolean }
  | { kind: "masterVolume"; value: number }
  | {
      kind: "masterFx";
      target: "delay" | "reverb";
      field: string;
      value: number | boolean;
    }
  | {
      kind: "patternCell";
      channel: number;
      order: number;
      row: number;
      cell: PatternCell;
    }
  | {
      kind: "orderPattern";
      order: number;
      channel: number;
      patternIndex: number;
    };

export interface BuildStep {
  /** Stable id, e.g. `instrument.0.attack`. */
  id: string;
  /** Few-word summary shown in the step list. */
  title: string;
  /** One sentence of detail. */
  detail: string;
  screen: StepScreen;
  instrument?: number;
  order?: number;
  highlights: StepHighlight[];
  action: StepAction;
}

export interface BuildTarget {
  project: ProjectFile;
  song: SongModel;
  settings: SamplerSettings[];
  channelVolume: number[];
  channelMuted: boolean[];
  masterVolume: number;
  masterFx: MasterFxSettings;
}

/** Snapshot a live session's model fields into a BuildTarget. */
export function cloneTarget(target: BuildTarget): BuildTarget {
  return structuredClone(target);
}

/**
 * A blank starting point for a stepthrough build: the same song structure
 * (orders, pattern length, instruments, samples) but with every value reset to
 * its default, so applying the recipe visibly builds the project up.
 */
export function blankTargetFrom(target: BuildTarget): BuildTarget {
  const blank = cloneTarget(target);
  const emptyCell = (): PatternCell => ({
    note: null,
    instrument: null,
    volume: null,
    effects: Array.from({ length: 8 }, () => ({
      effect: null,
      value: null,
    })),
  });
  blank.song.channels.forEach((channel) => {
    for (let order = 0; order < blank.song.meta.orderLength; order++) {
      for (let row = 0; row < blank.song.meta.patternLength; row++) {
        applyEdit(blank.song, {
          channel: channel.index,
          order,
          row,
          cell: emptyCell(),
        });
      }
    }
  });
  blank.song.instruments.forEach((instrument, index) => {
    instrument.name = `Instrument ${String(index).padStart(2, "0")}`;
  });
  blank.settings = blank.song.instruments.map(() => defaultSamplerSettings());
  blank.project.songTitle = "";
  blank.project.artist = "";
  blank.project.album = "";
  blank.project.comments = "";
  blank.project.tickRateOverride = null;
  blank.project.speedOverride = null;
  blank.project.highlightAOverride = null;
  blank.project.highlightBOverride = null;
  blank.project.virtualTempoOverride = null;
  blank.project.instrumentNames = blank.song.instruments.map(
    (_, index) => `Instrument ${String(index).padStart(2, "0")}`,
  );
  blank.project.sourceSamples = blank.project.sourceSamples.map((sample) =>
    sample
      ? { name: "", url: sample.url, comments: "", dataUrl: sample.dataUrl }
      : null,
  );
  blank.channelVolume = [1, 1, 1, 1];
  blank.channelMuted = [false, false, false, false];
  blank.masterVolume = 1;
  blank.masterFx = defaultMasterFx();
  return blank;
}

const EPSILON = 1e-6;

function differs(a: unknown, b: unknown): boolean {
  if (typeof a === "number" && typeof b === "number")
    return Math.abs(a - b) > EPSILON;
  return a !== b;
}

function fmt(value: number, unit = ""): string {
  const text = Number.isInteger(value)
    ? String(value)
    : String(Math.round(value * 1000) / 1000);
  return unit ? `${text}${unit}` : text;
}

function hex2(value: number): string {
  return value.toString(16).toUpperCase().padStart(2, "0").slice(-2);
}

/** Human-readable effect text, e.g. "01 - Pitch slide up 20". */
function effectSummary(effect: number | null, value: number | null): string {
  const entry = FX_CATALOG.find((candidate) => candidate.code === effect);
  const label = entry
    ? `${hex2(entry.code)} - ${entry.description}`
    : `FX ${hex2(effect ?? 0)}`;
  return value !== null ? `${label} ${hex2(value)}` : label;
}

type InstrumentField =
  | { kind: "source" }
  | {
      kind: "num";
      field: keyof SamplerSettings;
      label: string;
      group: string;
      unit?: string;
    }
  | {
      kind: "bool";
      field: keyof SamplerSettings;
      label: string;
      group: string;
    };

/** Emitted in the order the Sampler editor groups/rows are shown. */
const INSTRUMENT_FIELDS: InstrumentField[] = [
  { kind: "source" },
  { kind: "bool", field: "looping", label: "Loop", group: "Source" },
  { kind: "bool", field: "pingPong", label: "Ping-pong", group: "Source" },
  {
    kind: "num",
    field: "startSec",
    label: "Trim start",
    group: "Source",
    unit: "s",
  },
  {
    kind: "num",
    field: "endSec",
    label: "Trim end",
    group: "Source",
    unit: "s",
  },
  {
    kind: "num",
    field: "attack",
    label: "Attack",
    group: "Amp envelope",
    unit: "s",
  },
  {
    kind: "num",
    field: "decay",
    label: "Decay",
    group: "Amp envelope",
    unit: "s",
  },
  {
    kind: "num",
    field: "sustain",
    label: "Sustain",
    group: "Amp envelope",
  },
  {
    kind: "num",
    field: "release",
    label: "Release",
    group: "Amp envelope",
    unit: "s",
  },
  {
    kind: "num",
    field: "transpose",
    label: "Transpose",
    group: "Tuning & level",
    unit: "st",
  },
  {
    kind: "num",
    field: "volume",
    label: "Volume",
    group: "Tuning & level",
  },
  { kind: "num", field: "pan", label: "Pan", group: "Tuning & level" },
  {
    kind: "num",
    field: "panRandomRange",
    label: "Pan spread",
    group: "Tuning & level",
  },
  {
    kind: "num",
    field: "vibratoSpeed",
    label: "Speed",
    group: "Vibrato",
    unit: "Hz",
  },
  {
    kind: "num",
    field: "vibratoDepth",
    label: "Depth",
    group: "Vibrato",
    unit: "st",
  },
  {
    kind: "bool",
    field: "polyphonic",
    label: "Polyphonic",
    group: "Polyphony",
  },
  {
    kind: "num",
    field: "voiceCap",
    label: "Voice cap",
    group: "Polyphony",
  },
];

type SpectralField = {
  key: string;
  label: string;
  group: string;
  unit?: string;
  kind: "number" | "boolean" | "string";
};

const SPECTRAL_FIELDS: SpectralField[] = [
  { key: "mode", label: "Fusion mode", group: "Spectral", kind: "string" },
  { key: "oneShot", label: "One-shot", group: "Spectral", kind: "boolean" },
  {
    key: "loopLengthSeconds",
    label: "Loop length",
    group: "Spectral",
    unit: "s",
    kind: "number",
  },
  {
    key: "freezePoint",
    label: "Freeze point",
    group: "Source A",
    kind: "number",
  },
  { key: "tune", label: "Tune", group: "Source A", unit: "st", kind: "number" },
  {
    key: "formantShift",
    label: "Formant",
    group: "Source A",
    unit: "st",
    kind: "number",
  },
  { key: "volume", label: "Volume", group: "Source A", kind: "number" },
  {
    key: "sourceIndex2",
    label: "Source sample B",
    group: "Source B",
    kind: "string",
  },
  {
    key: "freezePointB",
    label: "Freeze point B",
    group: "Source B",
    kind: "number",
  },
  {
    key: "tuneB",
    label: "Tune B",
    group: "Source B",
    unit: "st",
    kind: "number",
  },
  {
    key: "formantShiftB",
    label: "Formant B",
    group: "Source B",
    unit: "st",
    kind: "number",
  },
  { key: "volumeB", label: "Volume B", group: "Source B", kind: "number" },
  { key: "mixAmount", label: "Mix amount", group: "Mix", kind: "number" },
  {
    key: "crossSynthAmount",
    label: "Cross-Synth amount",
    group: "Mix",
    kind: "number",
  },
  {
    key: "convolveAmount",
    label: "Convolve amount",
    group: "Mix",
    kind: "number",
  },
  {
    key: "ringModAmount",
    label: "Ring-Modulate amount",
    group: "Mix",
    kind: "number",
  },
  { key: "stereoWidth", label: "Stereo width", group: "Mix", kind: "number" },
];

const PERCUSSION_FIELDS: Array<{
  key: string;
  label: string;
  group: string;
  unit?: string;
}> = [
  { key: "noiseAmount", label: "Amount", group: "Noise" },
  { key: "noiseColor", label: "Colour", group: "Noise" },
  { key: "noiseDecay", label: "Decay", group: "Noise", unit: "s" },
  { key: "transientAmount", label: "Amount", group: "Transient" },
  { key: "transientDecay", label: "Decay", group: "Transient", unit: "s" },
  {
    key: "transientFrequency",
    label: "Frequency",
    group: "Transient",
    unit: "Hz",
  },
  { key: "pitchStart", label: "Pitch start", group: "Pitch & amp", unit: "st" },
  { key: "pitchEnd", label: "Pitch end", group: "Pitch & amp", unit: "st" },
  { key: "pitchDecay", label: "Pitch decay", group: "Pitch & amp", unit: "s" },
  { key: "ampDecay", label: "Amp decay", group: "Pitch & amp", unit: "s" },
  { key: "bodyAmount", label: "Body amount", group: "Body" },
  { key: "partialCount", label: "Partials", group: "Body" },
  { key: "partialDecay", label: "Partial decay", group: "Body", unit: "s" },
  { key: "digitalAmount", label: "Digital", group: "Character" },
  { key: "driveAmount", label: "Drive", group: "Character" },
  { key: "compressAmount", label: "Compression", group: "Character" },
  { key: "stereoWidth", label: "Stereo width", group: "Character" },
  { key: "lengthSeconds", label: "Length", group: "Character", unit: "s" },
];

/** True when a pattern cell has any content in any column. */
function cellHasContent(cell: PatternCell | undefined): cell is PatternCell {
  if (!cell) return false;
  if (cell.note || cell.instrument !== null || cell.volume !== null)
    return true;
  return (cell.effects ?? []).some(
    (slot) => slot.effect !== null || slot.value !== null,
  );
}

function cellSummary(cell: PatternCell): string {
  const parts: string[] = [];
  if (cell.note) {
    parts.push(
      cell.note.kind === "note"
        ? `note ${cell.note.note}`
        : cell.note.kind.toUpperCase(),
    );
  }
  if (cell.instrument !== null) parts.push(`ins ${cell.instrument}`);
  if (cell.volume !== null) parts.push(`vol ${cell.volume}`);
  const effects = (cell.effects ?? [])
    .filter((slot) => slot.effect !== null || slot.value !== null)
    .map((slot) => effectSummary(slot.effect, slot.value));
  if (effects.length > 0) parts.push(effects.join(", "));
  return parts.join(", ") || "cell";
}

/**
 * Synthesises the build recipe for a target. Emits a step only where a value
 * differs from the relevant default, in a canonical rebuild order.
 */
export function buildSteps(target: BuildTarget): BuildStep[] {
  const steps: BuildStep[] = [];
  const push = (step: Omit<BuildStep, "id"> & { id: string }): void => {
    steps.push(step);
  };
  const { project, song } = target;

  // ---- 1. Song metadata ----------------------------------------------------
  const metaFields: Array<{
    field: "songTitle" | "artist" | "album" | "comments";
    label: string;
  }> = [
    { field: "songTitle", label: "Title" },
    { field: "artist", label: "Artist" },
    { field: "album", label: "Album" },
    { field: "comments", label: "Comments" },
  ];
  for (const { field, label } of metaFields) {
    const value = project[field];
    if (!value) continue;
    push({
      id: `song.${field}`,
      title: `Song — ${label.toLowerCase()}`,
      detail: `Set the ${label.toLowerCase()} to “${String(value).slice(0, 60)}”.`,
      screen: "song",
      highlights: [{ kind: "param", group: "Song", label }],
      action: { kind: "songMeta", field, value },
    });
  }

  // ---- 2. Timing / highlight overrides ------------------------------------
  const timing: NonNullable<Extract<StepAction, { kind: "timing" }>> = {
    kind: "timing",
  };
  let hasTiming = false;
  if (project.tickRateOverride != null) {
    timing.tickRate = project.tickRateOverride;
    hasTiming = true;
  }
  if (project.speedOverride != null) {
    timing.speed = project.speedOverride;
    hasTiming = true;
  }
  if (project.highlightAOverride != null) {
    timing.highlightA = project.highlightAOverride;
    hasTiming = true;
  }
  if (project.highlightBOverride != null) {
    timing.highlightB = project.highlightBOverride;
    hasTiming = true;
  }
  if (hasTiming) {
    push({
      id: "song.timing",
      title: "Song — timing",
      detail: `Set tick rate${timing.tickRate != null ? ` ${timing.tickRate}Hz` : ""}${
        timing.speed != null ? `, speed ${timing.speed}` : ""
      }${timing.highlightA != null ? `, beat ${timing.highlightA}` : ""}${
        timing.highlightB != null ? `, bar ${timing.highlightB}` : ""
      }.`,
      screen: "song",
      highlights: [{ kind: "param", group: "Timing", label: "Timing" }],
      action: timing,
    });
  }

  // ---- 3. Source samples ---------------------------------------------------
  project.sourceSamples.forEach((sample, slot) => {
    if (!sample?.name) return;
    push({
      id: `sample.${slot}.name`,
      title: `Sample ${slot} — ${sample.name}`,
      detail: `Name source sample ${slot} “${sample.name}”${
        sample.comments ? ` and add notes.` : "."
      }`,
      screen: "samples",
      highlights: [{ kind: "sample", slot }],
      action: {
        kind: "sampleName",
        slot,
        name: sample.name,
        comments: sample.comments,
      },
    });
  });

  // ---- 4. Instruments ------------------------------------------------------
  target.settings.forEach((setting, instrument) => {
    const defaults = defaultSamplerSettings();
    const name = song.instruments[instrument]?.name ?? "";
    if (name && name !== `Instrument ${String(instrument).padStart(2, "0")}`) {
      push({
        id: `instrument.${instrument}.name`,
        title: `Ins ${instrument} — ${name}`,
        detail: `Rename instrument ${instrument} to “${name}”.`,
        screen: "instruments",
        instrument,
        highlights: [{ kind: "instrument", instrument }],
        action: { kind: "instrumentName", instrument, name },
      });
    }

    for (const entry of INSTRUMENT_FIELDS) {
      if (entry.kind === "source") {
        if (differs(setting.sourceIndex, defaults.sourceIndex)) {
          push({
            id: `instrument.${instrument}.source`,
            title: `Ins ${instrument} — source sample`,
            detail:
              setting.sourceIndex === null
                ? `Clear the source sample on instrument ${instrument}.`
                : `Assign source sample ${setting.sourceIndex} to instrument ${instrument}.`,
            screen: "sampler",
            instrument,
            highlights: [
              { kind: "param", group: "Source", label: "Source sample" },
            ],
            action: {
              kind: "instrumentSource",
              instrument,
              sourceIndex: setting.sourceIndex,
            },
          });
        }
        continue;
      }
      if (entry.kind === "bool") {
        const value = setting[entry.field] as boolean;
        const base = defaults[entry.field] as boolean;
        if (value === base) continue;
        push({
          id: `instrument.${instrument}.${String(entry.field)}`,
          title: `Ins ${instrument} — ${entry.label}`,
          detail: `${value ? "Enable" : "Disable"} ${entry.label.toLowerCase()}.`,
          screen: "sampler",
          instrument,
          highlights: [
            { kind: "param", group: entry.group, label: entry.label },
          ],
          action: {
            kind: "instrumentParam",
            instrument,
            field: entry.field,
            value,
          },
        });
        continue;
      }
      const value = setting[entry.field] as number;
      const base = defaults[entry.field] as number;
      if (!differs(value, base)) continue;
      // Voice cap is only shown once Polyphonic is on.
      if (entry.field === "voiceCap" && !setting.polyphonic) continue;
      push({
        id: `instrument.${instrument}.${String(entry.field)}`,
        title: `Ins ${instrument} — ${entry.label}`,
        detail: `Set ${entry.label.toLowerCase()} to ${fmt(value, entry.unit)}.`,
        screen: "sampler",
        instrument,
        highlights: [{ kind: "param", group: entry.group, label: entry.label }],
        action: {
          kind: "instrumentParam",
          instrument,
          field: entry.field,
          value,
        },
      });
    }

    // Spectral
    const spectral = setting.spectral;
    const spectralDefaults = defaultSpectralSettings();
    if (spectral.enabled !== spectralDefaults.enabled) {
      push({
        id: `instrument.${instrument}.spectral.enabled`,
        title: `Ins ${instrument} — spectral ${spectral.enabled ? "on" : "off"}`,
        detail: `${spectral.enabled ? "Enable" : "Disable"} Spectral fusion.`,
        screen: "spectral",
        instrument,
        highlights: [{ kind: "param", group: "Spectral", label: "Enabled" }],
        action: {
          kind: "spectralParam",
          instrument,
          field: "enabled",
          value: spectral.enabled,
        },
      });
    }
    if (spectral.enabled) {
      const amountKeyForMode =
        spectral.mode === "mix"
          ? "mixAmount"
          : spectral.mode === "cross-synth"
            ? "crossSynthAmount"
            : spectral.mode === "convolve"
              ? "convolveAmount"
              : spectral.mode === "ring-modulate"
                ? "ringModAmount"
                : null;
      const SOURCE_B_KEYS = [
        "sourceIndex2",
        "freezePointB",
        "tuneB",
        "formantShiftB",
        "volumeB",
      ];
      const AMOUNT_KEYS = [
        "mixAmount",
        "crossSynthAmount",
        "convolveAmount",
        "ringModAmount",
      ];
      for (const { key, label, group, unit, kind } of SPECTRAL_FIELDS) {
        // Skip options the Spectral menu hides for the current mode.
        if (SOURCE_B_KEYS.includes(key) && !spectralModeNeedsB(spectral.mode))
          continue;
        if (AMOUNT_KEYS.includes(key)) {
          if (!spectralModeHasAmount(spectral.mode)) continue;
          if (key !== amountKeyForMode) continue;
        }
        const value = (spectral as unknown as Record<string, unknown>)[key];
        const base = (spectralDefaults as unknown as Record<string, unknown>)[
          key
        ];
        if (!differs(value, base)) continue;
        push({
          id: `instrument.${instrument}.spectral.${key}`,
          title: `Ins ${instrument} — ${label}`,
          detail:
            kind === "boolean"
              ? `${value ? "Enable" : "Disable"} ${label.toLowerCase()}.`
              : `Set ${label.toLowerCase()} to ${
                  kind === "string" ? String(value) : fmt(value as number, unit)
                }.`,
          screen: "spectral",
          instrument,
          highlights: [{ kind: "param", group, label }],
          action: {
            kind: "spectralParam",
            instrument,
            field: key,
            value: value as never,
          },
        });
      }
    }

    // Percussion
    const percussion = spectral.percussion;
    if (percussion.enabled) {
      push({
        id: `instrument.${instrument}.percussion.enabled`,
        title: `Ins ${instrument} — percussion on`,
        detail: "Enable the Percussion post-stage.",
        screen: "percussion",
        instrument,
        highlights: [{ kind: "param", group: "Percussion", label: "Enabled" }],
        action: {
          kind: "percussionParam",
          instrument,
          field: "enabled",
          value: true,
        },
      });
      for (const { key, label, group, unit } of PERCUSSION_FIELDS) {
        const value = (percussion as unknown as Record<string, unknown>)[key];
        if (typeof value !== "number") continue;
        push({
          id: `instrument.${instrument}.percussion.${key}`,
          title: `Ins ${instrument} — ${label}`,
          detail: `Set percussion ${label.toLowerCase()} to ${fmt(value, unit)}.`,
          screen: "percussion",
          instrument,
          highlights: [{ kind: "param", group, label }],
          action: {
            kind: "percussionParam",
            instrument,
            field: key,
            value,
          },
        });
      }
    }
  });

  // ---- 5. Mixer ------------------------------------------------------------
  target.channelVolume.forEach((volume, channel) => {
    if (!differs(volume, 1)) return;
    push({
      id: `mixer.ch${channel}.volume`,
      title: `Mixer — CH${channel} volume`,
      detail: `Set channel ${channel} volume to ${Math.round(volume * 100)}%.`,
      screen: "mixer",
      highlights: [{ kind: "channel", channel }],
      action: { kind: "channelVolume", channel, value: volume },
    });
  });
  target.channelMuted.forEach((muted, channel) => {
    if (!muted) return;
    push({
      id: `mixer.ch${channel}.mute`,
      title: `Mixer — CH${channel} muted`,
      detail: `Mute channel ${channel}.`,
      screen: "mixer",
      highlights: [{ kind: "channel", channel }],
      action: { kind: "channelMute", channel, muted: true },
    });
  });
  if (differs(target.masterVolume, 1)) {
    push({
      id: "mixer.master.volume",
      title: "Mixer — master volume",
      detail: `Set master volume to ${Math.round(target.masterVolume * 100)}%.`,
      screen: "mixer",
      highlights: [{ kind: "row" }],
      action: { kind: "masterVolume", value: target.masterVolume },
    });
  }

  // ---- 6. Master FX --------------------------------------------------------
  const fxDefaults = defaultMasterFx();
  const FX_LABELS: Record<"delay" | "reverb", Record<string, string>> = {
    delay: {
      enabled: "Enabled",
      timeSec: "Time",
      feedback: "Feedback",
      toneHz: "Tone",
      mix: "Mix",
    },
    reverb: { enabled: "Enabled", decaySec: "Decay", mix: "Mix" },
  };
  (["delay", "reverb"] as const).forEach((targetName) => {
    const fx = target.masterFx[targetName];
    const base = fxDefaults[targetName];
    const group = targetName === "delay" ? "Delay" : "Reverb";
    if (fx.enabled !== base.enabled) {
      push({
        id: `fx.${targetName}.enabled`,
        title: `FX — ${targetName} ${fx.enabled ? "on" : "off"}`,
        detail: `${fx.enabled ? "Enable" : "Disable"} master ${targetName}.`,
        screen: "master-fx",
        highlights: [{ kind: "param", group, label: "Enabled" }],
        action: {
          kind: "masterFx",
          target: targetName,
          field: "enabled",
          value: fx.enabled,
        },
      });
    }
    for (const [field, value] of Object.entries(fx)) {
      if (field === "enabled") continue;
      const baseValue = (base as unknown as Record<string, unknown>)[field];
      if (!differs(value, baseValue)) continue;
      const label = FX_LABELS[targetName][field] ?? field;
      push({
        id: `fx.${targetName}.${field}`,
        title: `FX — ${targetName} ${label}`,
        detail: `Set ${targetName} ${label.toLowerCase()} to ${
          typeof value === "number" ? fmt(value) : String(value)
        }.`,
        screen: "master-fx",
        highlights: [{ kind: "param", group, label }],
        action: {
          kind: "masterFx",
          target: targetName,
          field,
          value: value as number | boolean,
        },
      });
    }
  });

  // ---- 7. Patterns ---------------------------------------------------------
  song.channels.slice(0, 4).forEach((channel, channelIndex) => {
    for (let order = 0; order < song.meta.orderLength; order++) {
      const patternIndex = channel.orderList[order];
      if (patternIndex === undefined) continue;
      const pattern = channel.patterns.get(patternIndex);
      if (!pattern) continue;
      for (let row = 0; row < pattern.rows.length; row++) {
        const cell = pattern.rows[row];
        if (!cellHasContent(cell)) continue;
        push({
          id: `pattern.${channelIndex}.${order}.${row}`,
          title: `CH${channelIndex} ${String(order).padStart(2, "0")}:${String(
            row,
          )
            .padStart(2, "0")
            .toUpperCase()} — ${cellSummary(cell)}`,
          detail: `Enter ${cellSummary(cell)} on channel ${channelIndex}, order ${order}, row ${row}.`,
          screen: "tracker",
          order,
          highlights: [{ kind: "cell", channel: channelIndex, order, row }],
          action: {
            kind: "patternCell",
            channel: channelIndex,
            order,
            row,
            cell: structuredClone(cell),
          },
        });
      }
    }
  });

  return steps;
}

/** Mutates a BuildTarget by applying a single build step. */
export function applyBuildStep(target: BuildTarget, step: BuildStep): void {
  const action = step.action;
  switch (action.kind) {
    case "songMeta":
      target.project[action.field] = action.value;
      break;
    case "timing": {
      if (action.tickRate != null) {
        target.project.tickRateOverride = action.tickRate;
        target.song.meta.tickRate = action.tickRate;
      }
      if (action.speed != null) {
        target.project.speedOverride = action.speed;
        target.song.meta.speedPattern = [action.speed];
      }
      if (action.highlightA != null) {
        target.project.highlightAOverride = action.highlightA;
        target.song.meta.highlightA = action.highlightA;
      }
      if (action.highlightB != null) {
        target.project.highlightBOverride = action.highlightB;
        target.song.meta.highlightB = action.highlightB;
      }
      break;
    }
    case "sampleName": {
      const samples = target.project.sourceSamples.slice();
      while (samples.length < 6) samples.push(null);
      const existing = samples[action.slot];
      samples[action.slot] = {
        name: action.name,
        url: existing?.url ?? null,
        comments: action.comments ?? existing?.comments ?? "",
        dataUrl: existing?.dataUrl ?? null,
      };
      target.project.sourceSamples = samples;
      break;
    }
    case "instrumentName": {
      if (target.song.instruments[action.instrument])
        target.song.instruments[action.instrument]!.name = action.name;
      const names = target.project.instrumentNames.slice();
      while (names.length <= action.instrument) names.push("");
      names[action.instrument] = action.name;
      target.project.instrumentNames = names;
      break;
    }
    case "instrumentSource": {
      const setting = target.settings[action.instrument];
      if (setting) setting.sourceIndex = action.sourceIndex;
      break;
    }
    case "instrumentParam": {
      const setting = target.settings[action.instrument];
      if (setting)
        (setting as unknown as Record<string, unknown>)[action.field] =
          action.value;
      break;
    }
    case "spectralParam": {
      const setting = target.settings[action.instrument];
      if (setting)
        (setting.spectral as unknown as Record<string, unknown>)[action.field] =
          action.value;
      break;
    }
    case "percussionParam": {
      const setting = target.settings[action.instrument];
      if (setting)
        (setting.spectral.percussion as unknown as Record<string, unknown>)[
          action.field
        ] = action.value;
      break;
    }
    case "channelVolume":
      target.channelVolume[action.channel] = action.value;
      break;
    case "channelMute":
      target.channelMuted[action.channel] = action.muted;
      break;
    case "masterVolume":
      target.masterVolume = action.value;
      break;
    case "masterFx": {
      const fx = target.masterFx[action.target] as unknown as Record<
        string,
        unknown
      >;
      fx[action.field] = action.value;
      break;
    }
    case "patternCell":
      applyEdit(target.song, {
        channel: action.channel,
        order: action.order,
        row: action.row,
        cell: action.cell,
      });
      break;
    case "orderPattern": {
      const channel = target.song.channels[action.channel];
      if (channel) channel.orderList[action.order] = action.patternIndex;
      break;
    }
  }
}
