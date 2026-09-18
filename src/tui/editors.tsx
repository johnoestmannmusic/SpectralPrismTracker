import { Text } from "ink";
import {
  PERCUSSION_NOISE_COLORS,
  PERCUSSION_PRESETS,
  SPECTRAL_FUSION_MODES,
  percussionPreset,
  spectralModeHasAmount,
  spectralModeLabel,
  spectralModeNeedsB,
  type PercussionNoiseColor,
  type PercussionPreset,
} from "@/core/spectral";
import type { MasterFxSettings } from "@/core/masterFx";
import { defaultSamplerSettings, type SamplerSettings } from "@/core/sampler";
import { renderEnvelope, renderWaveform } from "./format";
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

export type InstrumentTab = "sampler" | "spectral" | "percussion";

/**
 * Editor tab that matches an instrument's active mode: Percussion beats
 * Spectral beats plain Sampler.
 */
export function instrumentTabFor(
  settings: SamplerSettings | undefined,
): InstrumentTab {
  if (settings?.spectral.percussion.enabled) return "percussion";
  if (settings?.spectral.enabled) return "spectral";
  return "sampler";
}

/** Sampler/instrument editor groups. */
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
          "",
          [...PERCUSSION_PRESETS],
          (v) => {
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
            { min: 100, max: 8000, step: 10, unit: "Hz", preview: true },
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

/** Master output FX editor groups. */
export function masterFxGroups(
  session: Session,
  fxOverride?: MasterFxSettings,
): EditorGroup[] {
  const fx = fxOverride ?? session.getState().masterFx;
  const delay = fx.delay;
  const reverb = fx.reverb;
  const setDelay = (patch: Partial<typeof delay>) =>
    session.patchMasterFx({ delay: { ...delay, ...patch } });
  const setReverb = (patch: Partial<typeof reverb>) =>
    session.patchMasterFx({ reverb: { ...reverb, ...patch } });

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
  ];
}
