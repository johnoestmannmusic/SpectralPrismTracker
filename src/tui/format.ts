import type { PatternCell } from "@/core/fur/types";
import { noteToName } from "@/core/pitch";
import { envelopeAt, type SamplerSettings } from "@/core/sampler";

export const EMPTY_NOTE = "...";

function hex(value: number, width = 2): string {
  return Math.trunc(value)
    .toString(16)
    .toUpperCase()
    .padStart(width, "0")
    .slice(-width);
}

export function formatNote(cell: PatternCell): string {
  return cell.note ? noteToName(cell.note) : EMPTY_NOTE;
}

export function formatInstrument(cell: PatternCell): string {
  return cell.instrument === null ? ".." : hex(cell.instrument);
}

export function formatVolume(cell: PatternCell): string {
  return cell.volume === null ? ".." : hex(cell.volume);
}

export function formatEffect(cell: PatternCell, index = 0): string {
  const slot = cell.effects?.[index];
  if (!slot || slot.effect === null) return "....";
  const value = slot.value === null ? "--" : hex(slot.value);
  return `${hex(slot.effect)}${value}`;
}

/** `123.4` -> `2:03`. */
export function formatClock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
  const whole = Math.floor(seconds);
  const minutes = Math.floor(whole / 60);
  const rest = whole % 60;
  return `${minutes}:${String(rest).padStart(2, "0")}`;
}

const WAVE_CHARS = " ▁▂▃▄▅▆▇█";

/** Renders `[min,max]` waveform points as a fixed-width block-character line. */
export function renderWaveform(
  points: Array<[number, number]>,
  width: number,
): string {
  if (points.length === 0 || width <= 0)
    return "".padEnd(Math.max(width, 0), " ");
  const out: string[] = [];
  for (let i = 0; i < width; i++) {
    const start = Math.floor((i / width) * points.length);
    const end = Math.max(
      start + 1,
      Math.floor(((i + 1) / width) * points.length),
    );
    let peak = 0;
    for (let j = start; j < end && j < points.length; j++) {
      const point = points[j]!;
      peak = Math.max(peak, Math.abs(point[0]), Math.abs(point[1]));
    }
    const level = Math.min(
      WAVE_CHARS.length - 1,
      Math.round(peak * (WAVE_CHARS.length - 1)),
    );
    out.push(WAVE_CHARS[level]!);
  }
  return out.join("");
}

/** Renders a sampler ADSR envelope as a block-character sparkline. */
export function renderEnvelope(settings: SamplerSettings, width = 44): string {
  const span = Math.max(settings.attack + settings.decay + 0.45, 0.6);
  const out: string[] = [];
  for (let i = 0; i < width; i++) {
    const time = (i / (width - 1)) * span;
    const level = Math.min(Math.max(envelopeAt(settings, time), 0), 1);
    const index = Math.min(
      WAVE_CHARS.length - 1,
      Math.round(level * (WAVE_CHARS.length - 1)),
    );
    out.push(WAVE_CHARS[index]!);
  }
  return out.join("");
}
