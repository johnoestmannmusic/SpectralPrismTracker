import type { PatternCell } from "@/core/fur/types";
import { noteToName } from "@/core/pitch";

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
