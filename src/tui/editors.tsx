import { Text } from "ink";
import {
  PERCUSSION_NOISE_COLORS,
  PERCUSSION_PRESETS,
  SPECTRAL_FUSION_MODES,
  percussionPreset,
  percussionPresetName,
  spectralModeHasAmount,
  spectralModeLabel,
  spectralModeNeedsB,
  type PercussionNoiseColor,
  type PercussionPreset,
} from "@/core/spectral";
import type { MasterFxSettings } from "@/core/masterFx";
import {
  CHORD_PRESET_INTERVALS,
  CHORD_PRESETS,
  chordIntervals,
  defaultSamplerSettings,
  type ChordPreset,
  type SamplerSettings,
} from "@/core/sampler";
import { renderEnvelope, renderWaveform } from "./format";
import { dirname } from "@/runtime/paths";
import type { EditorGroup, EditorParam } from "./components/ParamEditorOverlay";
import type { Session, SongMetaField } from "./session";

type Setter = (value: number | boolean | string) => void;

interface NumOptions {
  min?: number;
  max?: number;
  step?: number;
  integer?: boolean;
  unit?: string;
  preview?: boolean;
  format?: (value: number) => string;
  explain?: string;
}

function num(
  label: string,
  value: number,
  set: Setter,
  options: NumOptions = {},
): EditorParam {
  return {
    label,
    kind: "number",
    value,
    min: options.min,
    max: options.max,
    step: options.step ?? 0.01,
    integer: options.integer,
    unit: options.unit,
    preview: options.preview,
    format: options.format ? (v) => options.format!(v as number) : undefined,
    explain: options.explain,
    set,
  };
}

function bool(
  label: string,
  value: boolean,
  set: Setter,
  preview?: boolean,
): EditorParam {
  return { label, kind: "toggle", value, preview, set };
}

function en(
  label: string,
  value: string,
  choices: string[],
  set: Setter,
  preview?: boolean,
): EditorParam {
  return { label, kind: "enum", value, choices, preview, set };
}

const pct = (label: string, value: number, set: Setter, preview = true) =>
  num(label, value, set, {
    min: 0,
    max: 100,
    step: 1,
    integer: true,
    unit: "%",
    preview,
  });
const signed = (label: string, value: number, set: Setter, preview = true) =>
  num(label, value, set, {
    min: -48,
    max: 48,
    step: 1,
    integer: true,
    unit: "st",
    preview,
  });
const unit01 = (label: string, value: number, set: Setter, preview = true) =>
  num(label, value, set, {
    min: 0,
    max: 1,
    step: 0.02,
    preview,
    format: (v) => `${Math.round(v * 100)}%`,
  });

function sourceChoices(): string[] {
  return ["none", "0", "1", "2", "3", "4", "5"];
}
const sourceValue = (index: number | null): string =>
  index === null ? "none" : String(index);
const parseSource = (value: string): number | null =>
  value === "none" ? null : Number(value);

export type InstrumentTab =
  "sampler" | "spectral" | "percussion" | "chord" | "microtextures";

/**
 * Editor tab that matches an instrument's active mode. Later chain stages win:
 * MicroTextures beats Chord beats Percussion beats Spectral beats Sampler.
 */
export function instrumentTabFor(
  settings: SamplerSettings | undefined,
): InstrumentTab {
  if (settings?.spectral.microTextures.enabled) return "microtextures";
  if (settings?.chord.enabled) return "chord";
  if (settings?.spectral.percussion.enabled) return "percussion";
  if (settings?.spectral.enabled) return "spectral";
  return "sampler";
}

/** SAMPLER-CORE / instrument editor groups. */
export function samplerGroups(
  session: Session,
  index: number,
  settingsOverride?: SamplerSettings,
): EditorGroup[] {
  const s =
    settingsOverride ??
    session.samplerSettings(index) ??
    defaultSamplerSettings();
  const set = (patch: Partial<SamplerSettings>) =>
    session.updateSamplerSetting(index, patch);
  const effective = session.effectiveWaveform(index);
  const waveform =
    effective.length > 0
      ? effective
      : s.sourceIndex !== null
        ? session.sampleWaveform(s.sourceIndex)
        : [];

  return [
    {
      title: "Instrument",
      params: [
        {
          label: "Name",
          kind: "text",
          value: session.instrumentName(index),
          set: (v) => session.setInstrumentName(index, String(v)),
          explain: "The instrument's display name, stored in the project.",
        },
      ],
    },
    {
      title: "Layers",
      params: [
        bool(
          "Spectral layer",
          s.spectral.enabled,
          (v) => set({ spectral: { ...s.spectral, enabled: !!v } }),
          true,
        ),
        bool(
          "Percussion stage",
          s.spectral.percussion.enabled,
          (v) =>
            set({
              spectral: {
                ...s.spectral,
                percussion: { ...s.spectral.percussion, enabled: !!v },
                oneShot: v ? true : s.spectral.oneShot,
              },
            }),
          true,
        ),
      ],
    },
    {
      title: `Waveform (${s.sourceIndex === null ? "no source" : `src ${s.sourceIndex}`})`,
      graph: (
        <Text color="green">
          {waveform.length > 0
            ? renderWaveform(waveform, 56)
            : "(no sample assigned)"}
        </Text>
      ),
      params: [],
    },
    {
      title: "Source",
      params: [
        en(
          "Source sample",
          sourceValue(s.sourceIndex),
          sourceChoices(),
          (v) => set({ sourceIndex: parseSource(String(v)) }),
          true,
        ),
        bool("Loop", s.looping, (v) => set({ looping: !!v }), true),
        ...(s.looping
          ? [bool("Ping-pong", s.pingPong, (v) => set({ pingPong: !!v }), true)]
          : []),
        ...(s.sourceIndex !== null
          ? [
              num(
                "Trim start",
                s.startSec,
                (v) => set({ startSec: v as number }),
                {
                  min: 0,
                  max: 30,
                  step: 0.01,
                  unit: "s",
                  preview: true,
                },
              ),
              num("Trim end", s.endSec, (v) => set({ endSec: v as number }), {
                min: 0,
                max: 30,
                step: 0.01,
                unit: "s",
                preview: true,
              }),
            ]
          : []),
      ],
    },
    {
      title: "Amp envelope",
      graph: <Text color="green">{renderEnvelope(s)}</Text>,
      params: [
        num("Attack", s.attack, (v) => set({ attack: v as number }), {
          min: 0.003,
          max: 5,
          step: 0.005,
          unit: "s",
          preview: true,
        }),
        num("Decay", s.decay, (v) => set({ decay: v as number }), {
          min: 0,
          max: 5,
          step: 0.005,
          unit: "s",
          preview: true,
        }),
        unit01("Sustain", s.sustain, (v) => set({ sustain: v as number })),
        num("Release", s.release, (v) => set({ release: v as number }), {
          min: 0,
          max: 5,
          step: 0.005,
          unit: "s",
          preview: true,
        }),
      ],
    },
    {
      title: "Tuning & level",
      params: [
        signed("Transpose", s.transpose, (v) =>
          set({ transpose: v as number }),
        ),
        num("Volume", s.volume, (v) => set({ volume: v as number }), {
          min: 0,
          max: 1.5,
          step: 0.02,
          preview: true,
          format: (v) => `${Math.round(v * 100)}%`,
        }),
        num("Pan", s.pan, (v) => set({ pan: v as number }), {
          min: -1,
          max: 1,
          step: 0.05,
          preview: true,
        }),
        unit01("Pan spread", s.panRandomRange, (v) =>
          set({ panRandomRange: v as number }),
        ),
      ],
    },
    {
      title: "Vibrato",
      params: [
        num(
          "Speed",
          s.vibratoSpeed,
          (v) => set({ vibratoSpeed: v as number }),
          { min: 0, max: 20, step: 0.1, unit: "Hz", preview: true },
        ),
        num(
          "Depth",
          s.vibratoDepth,
          (v) => set({ vibratoDepth: v as number }),
          { min: 0, max: 12, step: 0.1, unit: "st", preview: true },
        ),
      ],
    },
    {
      title: "Polyphony",
      params: [
        bool("Polyphonic", s.polyphonic, (v) => set({ polyphonic: !!v }), true),
        ...(s.polyphonic
          ? [
              num(
                "Voice cap",
                s.voiceCap,
                (v) => set({ voiceCap: v as number }),
                {
                  min: 1,
                  max: 32,
                  step: 1,
                  integer: true,
                  preview: true,
                },
              ),
            ]
          : []),
        bool("Choke", s.choke, (v) => set({ choke: !!v }), true),
      ],
    },
  ];
}

/** Spectral fusion editor groups. */
export function spectralGroups(
  session: Session,
  index: number,
  settingsOverride?: SamplerSettings,
): EditorGroup[] {
  const s =
    settingsOverride ??
    session.samplerSettings(index) ??
    defaultSamplerSettings();
  const sp = s.spectral;
  const set = (patch: Partial<typeof sp>) =>
    session.updateSamplerSetting(index, { spectral: { ...sp, ...patch } });
  const setSample = (sourceIndex: number | null) =>
    session.updateSamplerSetting(index, { sourceIndex });
  const fused = sp.enabled ? session.fusionWaveform(index) : [];
  const waveform =
    fused.length > 0
      ? fused
      : sp.enabled
        ? session.effectiveWaveform(index)
        : s.sourceIndex !== null
          ? session.sampleWaveform(s.sourceIndex)
          : [];
  const needsB = spectralModeNeedsB(sp.mode);
  const hasAmount = spectralModeHasAmount(sp.mode);
  const amountKey:
    "mixAmount" | "crossSynthAmount" | "convolveAmount" | "ringModAmount" =
    sp.mode === "mix"
      ? "mixAmount"
      : sp.mode === "cross-synth"
        ? "crossSynthAmount"
        : sp.mode === "convolve"
          ? "convolveAmount"
          : "ringModAmount";

  const groups: EditorGroup[] = [
    {
      title: `Waveform (${fused.length > 0 ? "fused render" : "source / not rendered"})`,
      graph: (
        <Text color="green">
          {waveform.length > 0
            ? renderWaveform(waveform, 56)
            : "(no render yet — enable or adjust)"}
        </Text>
      ),
      params: [],
    },
    {
      title: "Spectral",
      params: [
        bool("Enabled", sp.enabled, (v) => set({ enabled: !!v }), true),
        en(
          "Fusion mode",
          sp.mode,
          [...SPECTRAL_FUSION_MODES],
          (v) => set({ mode: v as typeof sp.mode }),
          true,
        ),
        bool("One-shot", sp.oneShot, (v) => set({ oneShot: !!v }), true),
        num(
          "Loop length",
          sp.loopLengthSeconds,
          (v) => set({ loopLengthSeconds: v as number }),
          { min: 0.5, max: 8, step: 0.1, unit: "s", preview: true },
        ),
      ],
    },
    {
      title: "Source A",
      params: [
        en(
          "Source sample",
          sourceValue(s.sourceIndex),
          sourceChoices(),
          (v) => setSample(parseSource(String(v))),
          true,
        ),
        pct("Freeze point", sp.freezePoint, (v) =>
          set({ freezePoint: v as number }),
        ),
        num("Tune", sp.tune, (v) => set({ tune: v as number }), {
          min: -24,
          max: 24,
          step: 1,
          preview: true,
          unit: "st",
        }),
        num(
          "Formant",
          sp.formantShift,
          (v) => set({ formantShift: v as number }),
          { min: -24, max: 24, step: 1, preview: true, unit: "st" },
        ),
        pct("Volume", sp.volume, (v) => set({ volume: v as number })),
      ],
    },
  ];

  // Source B only matters once a fusion algorithm is selected.
  if (needsB) {
    groups.push({
      title: "Source B",
      params: [
        en(
          "Source sample B",
          sourceValue(sp.sourceIndex2),
          sourceChoices(),
          (v) => set({ sourceIndex2: parseSource(String(v)) }),
          true,
        ),
        pct("Freeze point B", sp.freezePointB, (v) =>
          set({ freezePointB: v as number }),
        ),
        num("Tune B", sp.tuneB, (v) => set({ tuneB: v as number }), {
          min: -24,
          max: 24,
          step: 1,
          preview: true,
          unit: "st",
        }),
        num(
          "Formant B",
          sp.formantShiftB,
          (v) => set({ formantShiftB: v as number }),
          { min: -24, max: 24, step: 1, preview: true, unit: "st" },
        ),
        pct("Volume B", sp.volumeB, (v) => set({ volumeB: v as number })),
      ],
    });
  }

  // Only the amount for the selected algorithm, plus the shared stereo width.
  const mixParams: EditorParam[] = [];
  if (hasAmount) {
    mixParams.push(
      pct(`${spectralModeLabel(sp.mode)} amount`, sp[amountKey], (v) =>
        set({ [amountKey]: v } as Partial<typeof sp>),
      ),
    );
  }
  mixParams.push(
    pct("Stereo width", sp.stereoWidth, (v) =>
      set({ stereoWidth: v as number }),
    ),
  );
  groups.push({ title: "Mix", params: mixParams });

  groups.push({
    title: `Modulation (${sp.modulation.length} route${sp.modulation.length === 1 ? "" : "s"})`,
    graph: (
      <Text dimColor wrap="truncate-end">
        {sp.modulation.length === 0
          ? "none — modulation routes are authored in the project JSON"
          : sp.modulation
              .map(
                (route) =>
                  `${route.target} ${route.shape} ${route.depth > 0 ? "+" : ""}${route.depth} @${route.rateHz}Hz`,
              )
              .join(" · ")}
      </Text>
    ),
    params: [],
  });

  return groups;
}

/** Percussion post-stage editor groups. */
export function percussionGroups(
  session: Session,
  index: number,
  settingsOverride?: SamplerSettings,
): EditorGroup[] {
  const s =
    settingsOverride ??
    session.samplerSettings(index) ??
    defaultSamplerSettings();
  const sp = s.spectral;
  const percussion = sp.percussion;
  const set = (patch: Partial<typeof percussion>) =>
    session.updateSamplerSetting(index, {
      spectral: { ...sp, percussion: { ...percussion, ...patch } },
    });
  const fused = percussion.enabled ? session.fusionWaveform(index) : [];
  const waveform =
    fused.length > 0
      ? fused
      : percussion.enabled
        ? session.effectiveWaveform(index)
        : s.sourceIndex !== null
          ? session.sampleWaveform(s.sourceIndex)
          : [];

  const groups: EditorGroup[] = [
    {
      title: `Waveform (${fused.length > 0 ? "rendered hit" : "source / not rendered"})`,
      graph: (
        <Text color="green">
          {waveform.length > 0
            ? renderWaveform(waveform, 56)
            : "(no render yet — enable or adjust)"}
        </Text>
      ),
      params: [],
    },
    {
      title: "Percussion",
      params: [
        bool(
          "Enabled",
          percussion.enabled,
          (v) =>
            session.updateSamplerSetting(index, {
              spectral: {
                ...sp,
                percussion: { ...percussion, enabled: !!v },
                oneShot: v ? true : sp.oneShot,
              },
            }),
          true,
        ),
        bool(
          "One-shot (don't loop)",
          sp.oneShot,
          (v) =>
            session.updateSamplerSetting(index, {
              spectral: { ...sp, oneShot: !!v },
            }),
          true,
        ),
        en(
          "Preset",
          percussionPresetName(percussion),
          [...PERCUSSION_PRESETS, "custom"],
          (v) => {
            if (!(PERCUSSION_PRESETS as string[]).includes(String(v))) return;
            session.updateSamplerSetting(index, {
              spectral: {
                ...sp,
                oneShot: true,
                percussion: percussionPreset(v as PercussionPreset),
              },
            });
          },
          true,
        ),
      ],
    },
  ];

  // The synth controls only matter once Percussion is switched on.
  if (percussion.enabled) {
    groups.push(
      {
        title: "Noise",
        params: [
          pct("Amount", percussion.noiseAmount, (v) =>
            set({ noiseAmount: v as number }),
          ),
          en(
            "Colour",
            percussion.noiseColor,
            [...PERCUSSION_NOISE_COLORS],
            (v) => set({ noiseColor: v as PercussionNoiseColor }),
            true,
          ),
          num(
            "Decay",
            percussion.noiseDecay,
            (v) => set({ noiseDecay: v as number }),
            { min: 0, max: 1, step: 0.005, unit: "s", preview: true },
          ),
        ],
      },
      {
        title: "Transient",
        params: [
          pct("Amount", percussion.transientAmount, (v) =>
            set({ transientAmount: v as number }),
          ),
          num(
            "Decay",
            percussion.transientDecay,
            (v) => set({ transientDecay: v as number }),
            { min: 0, max: 0.2, step: 0.001, unit: "s", preview: true },
          ),
          num(
            "Frequency",
            percussion.transientFrequency,
            (v) => set({ transientFrequency: v as number }),
            { min: 100, max: 12000, step: 10, unit: "Hz", preview: true },
          ),
        ],
      },
      {
        title: "Pitch & amp",
        params: [
          num(
            "Pitch start",
            percussion.pitchStart,
            (v) => set({ pitchStart: v as number }),
            { min: -48, max: 48, step: 1, unit: "st", preview: true },
          ),
          num(
            "Pitch end",
            percussion.pitchEnd,
            (v) => set({ pitchEnd: v as number }),
            { min: -48, max: 48, step: 1, unit: "st", preview: true },
          ),
          num(
            "Pitch decay",
            percussion.pitchDecay,
            (v) => set({ pitchDecay: v as number }),
            { min: 0, max: 0.5, step: 0.002, unit: "s", preview: true },
          ),
          num(
            "Amp decay",
            percussion.ampDecay,
            (v) => set({ ampDecay: v as number }),
            { min: 0, max: 2, step: 0.005, unit: "s", preview: true },
          ),
        ],
      },
      {
        title: "Body",
        params: [
          pct("Body amount", percussion.bodyAmount, (v) =>
            set({ bodyAmount: v as number }),
          ),
          num(
            "Partials",
            percussion.partialCount,
            (v) => set({ partialCount: v as number }),
            { min: 1, max: 32, step: 1, integer: true, preview: true },
          ),
          num(
            "Partial decay",
            percussion.partialDecay,
            (v) => set({ partialDecay: v as number }),
            { min: 0, max: 2, step: 0.005, unit: "s", preview: true },
          ),
        ],
      },
      {
        title: "Character",
        params: [
          pct("Digital", percussion.digitalAmount, (v) =>
            set({ digitalAmount: v as number }),
          ),
          pct("Drive", percussion.driveAmount, (v) =>
            set({ driveAmount: v as number }),
          ),
          pct("Compression", percussion.compressAmount, (v) =>
            set({ compressAmount: v as number }),
          ),
          pct("Stereo width", percussion.stereoWidth, (v) =>
            set({ stereoWidth: v as number }),
          ),
          num(
            "Length",
            percussion.lengthSeconds,
            (v) => set({ lengthSeconds: v as number }),
            { min: 0.05, max: 2, step: 0.01, unit: "s", preview: true },
          ),
        ],
      },
    );
  }

  return groups;
}

/** Chord instrument-mode editor groups. */
export function chordGroups(
  session: Session,
  index: number,
  settingsOverride?: SamplerSettings,
): EditorGroup[] {
  const s =
    settingsOverride ??
    session.samplerSettings(index) ??
    defaultSamplerSettings();
  const chord = s.chord;
  const set = (patch: Partial<typeof chord>) =>
    session.updateSamplerSetting(index, { chord: { ...chord, ...patch } });
  const intervals = chordIntervals(chord).join(", ");
  const countFor = (preset: ChordPreset) =>
    preset === "custom"
      ? Math.max(chord.intervals.length, 1)
      : (CHORD_PRESET_INTERVALS[preset]?.length ?? 1);
  const fittedCap = (preset: ChordPreset, octaves: number) =>
    Math.max(chord.voiceCap, countFor(preset) * Math.max(octaves, 1));
  const customParam: EditorParam = {
    label: "Custom intervals",
    kind: "text",
    value: chord.intervals.join(","),
    set: (value) =>
      set({
        intervals: String(value)
          .split(",")
          .map((token) => Number(token.trim()))
          .filter((n) => Number.isFinite(n))
          .slice(0, 16),
      }),
    explain: "Root-relative semitones, comma-separated (e.g. 0,4,7,11).",
  };
  return [
    {
      title: "Chord",
      params: [
        bool("Enabled", chord.enabled, (v) => set({ enabled: !!v }), true),
        en(
          "Shape",
          chord.preset,
          [...CHORD_PRESETS],
          (v) =>
            set({
              preset: v as ChordPreset,
              voiceCap: fittedCap(v as ChordPreset, chord.octaves),
            }),
          true,
        ),
      ],
    },
    ...(chord.enabled
      ? [
          {
            title: "Voicing",
            params: [
              num(
                "Inversion",
                chord.inversion,
                (v) => set({ inversion: v as number }),
                { min: -2, max: 2, step: 1, integer: true, preview: true },
              ),
              num(
                "Octaves",
                chord.octaves,
                (v) =>
                  set({
                    octaves: v as number,
                    voiceCap: fittedCap(chord.preset, v as number),
                  }),
                {
                  min: 1,
                  max: 3,
                  step: 1,
                  integer: true,
                  preview: true,
                },
              ),
              num(
                "Detune",
                chord.detuneCents,
                (v) => set({ detuneCents: v as number }),
                { min: 0, max: 50, step: 1, unit: "c", preview: true },
              ),
              num(
                "Strum",
                chord.strumSec,
                (v) => set({ strumSec: v as number }),
                {
                  min: 0,
                  max: 0.2,
                  step: 0.005,
                  unit: "s",
                  preview: true,
                },
              ),
              unit01("Pan spread", chord.panSpread, (v) =>
                set({ panSpread: v as number }),
              ),
              num(
                "Voices",
                chord.voiceCap,
                (v) => set({ voiceCap: v as number }),
                {
                  min: 1,
                  max: 16,
                  step: 1,
                  integer: true,
                  preview: true,
                },
              ),
            ],
          },
          {
            title: `Intervals (${intervals})`,
            params: chord.preset === "custom" ? [customParam] : [],
          },
        ]
      : []),
  ];
}

/** MicroTextures instrument-mode editor groups. */
export function microtexturesGroups(
  session: Session,
  index: number,
  settingsOverride?: SamplerSettings,
): EditorGroup[] {
  const s =
    settingsOverride ??
    session.samplerSettings(index) ??
    defaultSamplerSettings();
  const sp = s.spectral;
  const micro = sp.microTextures;
  const set = (patch: Partial<typeof micro>) =>
    session.updateSamplerSetting(index, {
      spectral: { ...sp, microTextures: { ...micro, ...patch } },
    });
  const fused = micro.enabled ? session.fusionWaveform(index) : [];
  const waveform =
    fused.length > 0
      ? fused
      : micro.enabled
        ? session.effectiveWaveform(index)
        : s.sourceIndex !== null
          ? session.sampleWaveform(s.sourceIndex)
          : [];
  return [
    {
      title: `Waveform (${fused.length > 0 ? "microtexture render" : "source / not rendered"})`,
      graph: (
        <Text color="green">
          {waveform.length > 0
            ? renderWaveform(waveform, 56)
            : "(no render yet — enable or adjust)"}
        </Text>
      ),
      params: [],
    },
    {
      title: "MicroTextures",
      params: [
        bool("Enabled", micro.enabled, (v) => set({ enabled: !!v }), true),
        num(
          "Grain size",
          micro.grainSeconds,
          (v) => set({ grainSeconds: v as number }),
          { min: 0.005, max: 0.5, step: 0.005, unit: "s", preview: true },
        ),
        num(
          "Density",
          micro.densityHz,
          (v) => set({ densityHz: v as number }),
          { min: 0.5, max: 60, step: 0.5, unit: "Hz", preview: true },
        ),
        unit01("Jitter", micro.jitter, (v) => set({ jitter: v as number })),
        unit01("Reverse", micro.reverseProbability, (v) =>
          set({ reverseProbability: v as number }),
        ),
        num(
          "Pitch scatter",
          micro.pitchScatter,
          (v) => set({ pitchScatter: v as number }),
          { min: 0, max: 24, step: 0.5, unit: "st", preview: true },
        ),
        unit01("Pan scatter", micro.panScatter, (v) =>
          set({ panScatter: v as number }),
        ),
        unit01("Volume variance", micro.volumeVariance, (v) =>
          set({ volumeVariance: v as number }),
        ),
        num(
          "Density mod rate",
          micro.densityModRate,
          (v) => set({ densityModRate: v as number }),
          { min: 0.05, max: 10, step: 0.05, unit: "Hz", preview: true },
        ),
        unit01("Density mod depth", micro.densityModDepth, (v) =>
          set({ densityModDepth: v as number }),
        ),
        unit01("Grain chaos", micro.grainChaos, (v) =>
          set({ grainChaos: v as number }),
        ),
      ],
    },
    {
      title: "Retrigger",
      params: [
        num(
          "Rate",
          micro.retriggerHz,
          (v) => set({ retriggerHz: v as number }),
          { min: 0.5, max: 30, step: 0.5, unit: "Hz", preview: true },
        ),
        unit01("Amount", micro.retriggerAmount, (v) =>
          set({ retriggerAmount: v as number }),
        ),
      ],
    },
    {
      title: "Formant",
      params: [
        num(
          "Shift",
          micro.formantShift,
          (v) => set({ formantShift: v as number }),
          { min: -24, max: 24, step: 1, unit: "st", preview: true },
        ),
        unit01("Resonance", micro.formantResonance, (v) =>
          set({ formantResonance: v as number }),
        ),
        unit01("Mix", micro.formantMix, (v) =>
          set({ formantMix: v as number }),
        ),
      ],
    },
    {
      title: "Lo-fi",
      params: [
        num(
          "Bit depth",
          micro.bitDepth,
          (v) => set({ bitDepth: v as number }),
          { min: 2, max: 16, step: 1, integer: true, preview: true },
        ),
        num(
          "Downsample",
          micro.downsample,
          (v) => set({ downsample: v as number }),
          { min: 1, max: 32, step: 1, integer: true, preview: true },
        ),
      ],
    },
  ];
}

/** WAV export options groups (the export modal). */
/** Default WAV target: `<project dir>/<song title>.wav`, else the cwd. */
export function defaultWavOutputPath(session: Session): string {
  const state = session.getState();
  const raw = state.project?.songTitle || state.song?.meta.name || "export";
  const name = raw.replace(/[^\w.-]+/g, "_") || "export";
  const dir = state.projectPath ? dirname(state.projectPath) : "";
  return dir ? `${dir}/${name}.wav` : `${name}.wav`;
}

export function wavExportGroups(
  session: Session,
  onExport?: () => void,
  onChooseOutput?: () => void,
): EditorGroup[] {
  const state = session.getState();
  const w = state.wavExport;
  const set = (patch: Partial<typeof w>) => session.setWavExport(patch);
  const outputPath = w.outputPath || defaultWavOutputPath(session);
  const outputParams: EditorParam[] = [
    {
      label: "Output file",
      kind: "text",
      value: outputPath,
      set: (value) => set({ outputPath: String(value) }),
      explain:
        "Full path to write. Type it here, or use the row below to browse for a folder and filename.",
    },
  ];
  if (onChooseOutput) {
    outputParams.push({
      label: "Choose output location…",
      kind: "action",
      value: "",
      set: () => {},
      explain: "Open a directory tree to pick the folder and filename.",
      run: onChooseOutput,
    });
  }
  const params: EditorParam[] = [
    num("Loops", w.loops, (v) => set({ loops: v as number }), {
      min: 0,
      max: 99,
      step: 1,
      integer: true,
    }),
    num("Fade in", w.fadeInMs, (v) => set({ fadeInMs: v as number }), {
      min: 0,
      max: 60_000,
      step: 10,
      unit: "ms",
    }),
    num("Fade out", w.fadeOutMs, (v) => set({ fadeOutMs: v as number }), {
      min: 0,
      max: 60_000,
      step: 10,
      unit: "ms",
      explain:
        "In Cycles Mode with a track length set, the fade is applied to the final ms of that track (e.g. 4000 ms on a 25 s track starts at 21 s) and continues the patterns instead of restarting them.",
    }),
    bool("Peak normalize", w.normalize, (v) => set({ normalize: !!v })),
  ];
  if (session.getState().cyclesMode) {
    params.push(
      num(
        "Track length",
        w.lengthSeconds,
        (v) => set({ lengthSeconds: v as number }),
        {
          min: 0,
          max: 3600,
          step: 1,
          unit: "s",
          explain:
            "Expected output length in Cycles Mode. 0 = the full song loop (auto-capped at 300 s when a polymeter loop is longer). When > 0 the export fills exactly this length and fade in/out land inside it.",
        },
      ),
    );
  }
  const groups: EditorGroup[] = [
    { title: "Output", params: outputParams },
    { title: "Export WAV", params },
  ];
  if (onExport) {
    groups.push({
      title: "Action",
      params: [
        {
          label: "Start export",
          kind: "action",
          value: "",
          set: () => {},
          explain:
            "Renders the song offline (master FX included) and writes the WAV.",
          run: onExport,
        },
      ],
    });
  }
  return groups;
}

/** Editable Song Info groups (title, credits, links, timing) for `/info`. */
export function songInfoGroups(session: Session): EditorGroup[] {
  const { project, song } = session.getState();
  if (!project || !song) return [];
  const text = (
    label: string,
    field: SongMetaField,
    explain: string,
  ): EditorParam => ({
    label,
    kind: "text",
    value: project[field] ?? "",
    set: (value) => session.setSongMeta(field, String(value)),
    explain,
  });
  return [
    {
      title: "Song",
      params: [
        text("Title", "songTitle", "The song's display title."),
        text("Artist", "artist", "Who made the song."),
        text("Album", "album", "Album or collection the song belongs to."),
        text("Comments", "comments", "Free-form notes stored with the song."),
      ],
    },
    {
      title: "Credits",
      params: [
        text("Music license", "musicLicense", "License for the music itself."),
        text(
          "Code license",
          "codeLicense",
          "License for any code shipped with the song.",
        ),
        text(
          "Source link",
          "viewSourceLink",
          "Where the song's source can be viewed.",
        ),
        text("Website link", "websiteLink", "Artist or project website."),
      ],
    },
    {
      title: "Timing",
      params: [
        num("BPM", song.meta.bpm, (value) => session.setBpm(value as number), {
          min: 20,
          max: 999,
          step: 1,
          integer: true,
        }),
        num(
          "Beat highlight rows",
          song.meta.highlightA,
          (value) =>
            session.setHighlight(value as number, song.meta.highlightB),
          { min: 1, max: 64, step: 1, integer: true },
        ),
        num(
          "Bar highlight rows",
          song.meta.highlightB,
          (value) =>
            session.setHighlight(song.meta.highlightA, value as number),
          { min: 1, max: 256, step: 1, integer: true },
        ),
      ],
    },
  ];
}

/**
 * Per-channel Cycles phasing controls (FEAT-143). Moved here from the Mixer so
 * `/fx` is the single home. Values only affect Cycles Mode playback, but they
 * are always editable so a song can be prepared before switching views.
 */
function channelPhasingGroups(session: Session): EditorGroup[] {
  const params: EditorParam[] = [];
  for (let channel = 0; channel < 4; channel++) {
    const explain =
      "Cycles Mode phasing: shifts this channel's cycle start, row-advance speed and tape-drift detune so the channels slowly drift apart.";
    params.push(
      num(
        `CH${channel + 1} phase`,
        session.channelPhaseOffset(channel),
        (v) => session.setChannelPhaseOffset(channel, Math.round(v as number)),
        {
          min: 0,
          max: 64,
          step: 1,
          integer: true,
          format: (v) => `${Math.round(v)} rows`,
        },
      ),
      num(
        `CH${channel + 1} speed`,
        session.channelSpeed(channel),
        (v) => session.setChannelSpeed(channel, v as number),
        {
          min: 0.25,
          max: 4,
          step: 0.25,
          format: (v) => `${v.toFixed(2)}x`,
        },
      ),
      num(
        `CH${channel + 1} drift`,
        session.channelDetuneDrift(channel),
        (v) => session.setChannelDetuneDrift(channel, v as number),
        { min: 0, max: 24, step: 1, unit: " cents" },
      ),
      num(
        `CH${channel + 1} drift hz`,
        session.channelDetuneRate(channel),
        (v) => session.setChannelDetuneRate(channel, v as number),
        { min: 0.05, max: 2, step: 0.05, unit: " Hz" },
      ),
    );
    for (const param of params.slice(-4)) param.explain = explain;
  }
  return [{ title: "Channel Phasing", params }];
}

/** Master output FX editor groups. */
export function masterFxGroups(
  session: Session,
  fxOverride?: MasterFxSettings,
): EditorGroup[] {
  const fx = fxOverride ?? session.getState().masterFx;
  const delay = fx.delay;
  const reverb = fx.reverb;
  const downsample = fx.downsample;
  const setDelay = (patch: Partial<typeof delay>) =>
    session.patchMasterFx({ delay: { ...delay, ...patch } });
  const setReverb = (patch: Partial<typeof reverb>) =>
    session.patchMasterFx({ reverb: { ...reverb, ...patch } });
  const setDownsample = (patch: Partial<typeof downsample>) =>
    session.patchMasterFx({ downsample: { ...downsample, ...patch } });

  return [
    {
      title: "Delay",
      params: [
        bool("Enabled", delay.enabled, (v) => setDelay({ enabled: !!v })),
        num("Time", delay.timeSec, (v) => setDelay({ timeSec: v as number }), {
          min: 0.01,
          max: 2,
          step: 0.01,
          unit: "s",
        }),
        unit01("Feedback", delay.feedback, (v) =>
          setDelay({ feedback: v as number }),
        ),
        num("Tone", delay.toneHz, (v) => setDelay({ toneHz: v as number }), {
          min: 200,
          max: 12000,
          step: 50,
          unit: "Hz",
        }),
        unit01("Mix", delay.mix, (v) => setDelay({ mix: v as number })),
      ],
    },
    {
      title: "Reverb",
      params: [
        bool("Enabled", reverb.enabled, (v) => setReverb({ enabled: !!v })),
        num(
          "Decay",
          reverb.decaySec,
          (v) => setReverb({ decaySec: v as number }),
          { min: 0.1, max: 8, step: 0.1, unit: "s" },
        ),
        unit01("Mix", reverb.mix, (v) => setReverb({ mix: v as number })),
      ],
    },
    {
      title: "Downsample",
      params: [
        bool("Enabled", downsample.enabled, (v) =>
          setDownsample({ enabled: !!v }),
        ),
        num(
          "Rate",
          downsample.rateHz,
          (v) => setDownsample({ rateHz: v as number }),
          {
            min: 4000,
            max: 24000,
            step: 100,
            integer: true,
            unit: " Hz",
            explain:
              "Very last stage: sample-and-hold decimation for a GBA-ish crunch. 8000–11025 Hz is the classic range; lower is grittier. Off by default.",
          },
        ),
        bool("Low-pass", downsample.lowpassEnabled, (v) =>
          setDownsample({ lowpassEnabled: !!v }),
        ),
        num(
          "Low-pass Hz",
          downsample.lowpassHz,
          (v) => setDownsample({ lowpassHz: v as number }),
          {
            min: 200,
            max: 20000,
            step: 100,
            integer: true,
            unit: " Hz",
            explain:
              "Optional one-pole low-pass after the hold, to tame the crunch. Lower = darker; off = raw.",
          },
        ),
      ],
    },
    ...channelPhasingGroups(session),
  ];
}
