import type { PatternCell } from "@/core/fur/types";
import { noteToFreq, noteToName } from "@/core/pitch";
import { cellAt, type SongModel } from "@/core/songModel";
import {
  FX_CATALOG,
  columnLabel,
  flatColumnsForChannel,
  type EditColumn,
} from "@/core/tracker";
import type { SessionState } from "./session";

/**
 * TUI port of the original app's hover explainer. There is no mouse in a
 * terminal, so the equivalent trigger is the current selection: the tracker
 * cell under the cursor, or the highlighted row in an open menu. The panel on
 * the right-hand side always shows the matching text.
 */
export interface ExplainerText {
  title: string;
  body: string;
}

export const DEFAULT_EXPLAINER: ExplainerText = {
  title: "EXPLAINER",
  body: "Move the cursor over a pattern cell to see what it means. Effect columns explain the Furnace effect code in place, and open menus explain the highlighted setting.",
};

const CHANNEL_ROLES = [
  "Pulse 1 — a square wave with a selectable duty cycle and a Game Boy hardware envelope.",
  "Pulse 2 — the same hardware as Pulse 1, used as a second voice (no frequency sweep).",
  "Wave — plays a custom 32-sample, 4-bit waveform instead of a fixed shape.",
  "Noise — a pseudo-random LFSR generator, typically used for percussion.",
];

const CHANNEL_NAMES = ["Pulse 1", "Pulse 2", "Wave", "Noise"];

function hex2(value: number): string {
  return value.toString(16).toUpperCase().padStart(2, "0");
}

function instrumentDescription(song: SongModel, index: number): string {
  const ins = song.instruments[index];
  if (!ins) return `instrument ${index}`;
  const gb = ins.gameBoy;
  if (!gb) return ins.name || `#${index}`;
  return `${ins.name || `#${index}`} (envelope ${gb.envelopeVolume} ${
    gb.envelopeDirection ? "up" : "down"
  }/${gb.envelopeLength}${gb.softwareEnvelope ? ", software envelope" : ""})`;
}

export function patternsExplain(song: SongModel): ExplainerText {
  return {
    title: "Patterns — the actual note data",
    body: `All four channels at one order position, like Furnace's own view. Each has its own order list (${song.meta.orderLength} positions) of ${song.meta.patternLength}-row patterns.\n\nRow shading follows this song's highlights (${song.meta.highlightA}/${song.meta.highlightB}). OFF = note off; ... / .. / .... = empty note / ins-vol / effect.`,
  };
}

export function rowExplain(
  song: SongModel,
  order: number,
  row: number,
): ExplainerText {
  const speed = song.meta.speedPattern[0] ?? 6;
  const rowDur = speed / Math.max(song.meta.tickRate, 1);
  const absRow = order * song.meta.patternLength + row;
  return {
    title: `Row ${hex2(row)} · order ${order}`,
    body: `At speed ${speed} ticks/row (${song.meta.tickRate.toFixed(
      2,
    )} Hz), lands ~${(absRow * rowDur).toFixed(2)}s into the song. Move here to audition the row.`,
  };
}

export function channelExplain(
  song: SongModel,
  channel: number,
  muted: boolean,
): ExplainerText {
  const effects = song.channels[channel]?.effectColumns ?? 1;
  return {
    title: `Channel ${channel} · ${CHANNEL_NAMES[channel] ?? ""}`,
    body: `${CHANNEL_ROLES[channel] ?? ""}\n\nEffect columns: ${effects}.${
      muted ? " Currently muted." : ""
    }`,
  };
}

export function instrumentExplain(
  song: SongModel,
  index: number,
): ExplainerText {
  const ins = song.instruments[index];
  const gb = ins?.gameBoy;
  return {
    title: `Instrument ${index.toString().padStart(2, "0")} · ${ins?.name ?? ""}`,
    body: gb
      ? `Game Boy envelope: starts at volume ${gb.envelopeVolume}, ${
          gb.envelopeDirection ? "increasing" : "decreasing"
        } every ${gb.envelopeLength} step(s). Sound length ${gb.soundLength} (64 = held). Software envelope: ${
          gb.softwareEnvelope ? "yes" : "no"
        }.`
      : "A Furnace instrument.",
  };
}

export function cellExplain(
  song: SongModel,
  channel: number,
  order: number,
  row: number,
  column: EditColumn,
  cell: PatternCell | undefined,
): ExplainerText {
  const label = `CH${channel} · row ${hex2(row)} · ${columnLabel(column)}`;
  if (!cell) return { title: label, body: "Empty cell." };

  if (column.kind === "note") {
    const note = cell.note;
    if (!note) {
      return {
        title: label,
        body: "No note event here — any note from an earlier row keeps sounding.",
      };
    }
    if (note.kind === "off") {
      return {
        title: `${label} · NOTE OFF`,
        body: "Releases the currently sounding note — the envelope decays/cuts from here instead of a new pitch starting.",
      };
    }
    if (note.kind === "release") {
      return {
        title: `${label} · RELEASE`,
        body: "Applies the instrument's musical release from this row.",
      };
    }
    if (note.kind === "macroRelease") {
      return {
        title: `${label} · MACRO RELEASE`,
        body: "A chip macro release — a hardware command, not a sampler note-off.",
      };
    }
    if (note.kind === "rawFreq") {
      return {
        title: `${label} · FRQ ${note.value}`,
        body: `Direct frequency override of ${note.value} Hz (format version 248+).`,
      };
    }
    const freq = noteToFreq(note, song.meta.tuningA4) ?? 0;
    const ins = cell.instrument ?? null;
    return {
      title: `${label} · ${noteToName(note)}`,
      body: `note = ${noteToName(note)} (raw ${note.note})\n≈ ${freq.toFixed(
        2,
      )} Hz (tuning ${song.meta.tuningA4} Hz).\n${
        ins !== null
          ? `Instrument ${ins} · ${instrumentDescription(song, ins)}.`
          : "No instrument set yet on this channel."
      }`,
    };
  }

  if (column.kind === "ins") {
    if (cell.instrument === null) {
      return { title: label, body: "No change — keeps the prior instrument." };
    }
    return {
      title: `${label} · instrument ${cell.instrument}`,
      body: `Selects ${cell.instrument} · ${instrumentDescription(
        song,
        cell.instrument,
      )} from here until the next change.`,
    };
  }

  if (column.kind === "vol") {
    if (cell.volume === null) {
      return {
        title: label,
        body: "No override — plays at whatever level the envelope / volume slide already set.",
      };
    }
    return {
      title: `${label} · volume ${cell.volume}`,
      body: `volume = ${cell.volume} / 15 (≈ ${Math.round(
        (cell.volume / 15) * 100,
      )}%) from here until the next volume cell or slide.`,
    };
  }

  const slot = cell.effects[column.index];
  const effect = slot?.effect ?? null;
  const value = slot?.value ?? null;
  if (effect === null && value === null) {
    return { title: label, body: "No effect in this column this row." };
  }
  const entry = FX_CATALOG.find((e) => e.code === effect);
  const meaning = entry
    ? `${entry.description} (${entry.label}).`
    : `Effect 0x${hex2(
        effect ?? 0,
      )} — parsed and preserved, not documented here yet.`;
  return {
    title: `${label} · 0x${hex2(effect ?? 0)}${hex2(value ?? 0)}`,
    body: `effect = code 0x${hex2(effect ?? 0)}, value 0x${hex2(
      value ?? 0,
    )}.\n${meaning}`,
  };
}

/** Explainer for the cell/column currently under the tracker cursor. */
export function explainCursor(state: SessionState): ExplainerText {
  const song = state.song;
  if (!song) return DEFAULT_EXPLAINER;
  const { cursor } = state;
  const column = flatColumnsForChannel(song, cursor.channel)[cursor.column];
  if (!column) {
    return channelExplain(
      song,
      cursor.channel,
      state.channelMuted[cursor.channel] ?? false,
    );
  }
  const cell = cellAt(song, cursor.channel, cursor.order, cursor.row);
  return cellExplain(
    song,
    cursor.channel,
    cursor.order,
    cursor.row,
    column,
    cell,
  );
}
