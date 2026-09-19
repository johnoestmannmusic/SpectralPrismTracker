/** Master output effects: one delay (PS1-style echo), one reverb, and an
 * end-of-chain sample-rate downsample (GBA-style lo-fi). */

export interface DelayFxSettings {
  enabled: boolean;
  /** Delay time in seconds. */
  timeSec: number;
  /** Feedback amount 0..0.95. */
  feedback: number;
  /** Low-pass tone cutoff in Hz (the lo-fi PS1 character). */
  toneHz: number;
  /** Wet level 0..1. */
  mix: number;
}

export interface ReverbFxSettings {
  enabled: boolean;
  /** Impulse decay time in seconds. */
  decaySec: number;
  /** Wet level 0..1. */
  mix: number;
}

export interface DownsampleFxSettings {
  enabled: boolean;
  /** Target sample rate in Hz. Lower = crunchier (GBA is roughly 8–11 kHz). */
  rateHz: number;
}

export interface MasterFxSettings {
  delay: DelayFxSettings;
  reverb: ReverbFxSettings;
  /** Sample-and-hold decimation applied as the very last stage. */
  downsample: DownsampleFxSettings;
}

/** GBA-ish default target; disabled until switched on. */
export const DEFAULT_DOWNSAMPLE_HZ = 11_025;

export function defaultMasterFx(): MasterFxSettings {
  return {
    delay: {
      enabled: false,
      timeSec: 0.25,
      feedback: 0.45,
      toneHz: 2600,
      mix: 0.35,
    },
    reverb: { enabled: false, decaySec: 2.0, mix: 0.25 },
    downsample: { enabled: false, rateHz: DEFAULT_DOWNSAMPLE_HZ },
  };
}

/** The iconic PlayStation echo: short, dark, repeats a few times. */
export function ps1EchoPreset(): MasterFxSettings {
  return {
    delay: {
      enabled: true,
      timeSec: 0.19,
      feedback: 0.5,
      toneHz: 2200,
      mix: 0.4,
    },
    reverb: { enabled: false, decaySec: 2.0, mix: 0.25 },
    downsample: { enabled: false, rateHz: DEFAULT_DOWNSAMPLE_HZ },
  };
}

export function masterFxFromJson(value: unknown): MasterFxSettings {
  const d = defaultMasterFx();
  if (!value || typeof value !== "object") return d;
  const obj = value as Record<string, unknown>;
  const delayRaw = (obj.delay ?? {}) as Record<string, unknown>;
  const reverbRaw = (obj.reverb ?? {}) as Record<string, unknown>;
  const downsampleRaw = (obj.downsample ?? {}) as Record<string, unknown>;
  const num = (o: Record<string, unknown>, k: string, fallback: number) =>
    typeof o[k] === "number" ? (o[k] as number) : fallback;
  const bool = (o: Record<string, unknown>, k: string, fallback: boolean) =>
    typeof o[k] === "boolean" ? (o[k] as boolean) : fallback;
  return {
    delay: {
      enabled: bool(delayRaw, "enabled", d.delay.enabled),
      timeSec: num(delayRaw, "timeSec", d.delay.timeSec),
      feedback: num(delayRaw, "feedback", d.delay.feedback),
      toneHz: num(delayRaw, "toneHz", d.delay.toneHz),
      mix: num(delayRaw, "mix", d.delay.mix),
    },
    reverb: {
      enabled: bool(reverbRaw, "enabled", d.reverb.enabled),
      decaySec: num(reverbRaw, "decaySec", d.reverb.decaySec),
      mix: num(reverbRaw, "mix", d.reverb.mix),
    },
    downsample: {
      enabled: bool(downsampleRaw, "enabled", d.downsample.enabled),
      rateHz: Math.max(1000, num(downsampleRaw, "rateHz", d.downsample.rateHz)),
    },
  };
}
