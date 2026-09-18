import type { PatternCell } from "@/core/songTypes";
import { noteToFreq, noteToName } from "@/core/pitch";
import { cellAt, type SongModel } from "@/core/songModel";
import { rowDurationSec } from "@/core/timing";
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
  body: "Move the cursor over a pattern cell to see what it means. Effect columns explain the effect code in place, and open menus explain the highlighted setting.",
};

const CHANNEL_ROLES = [
  "Channel 1 — a sampler voice. Notes trigger the assigned instrument (sampler, spectral or percussion) on this channel.",
  "Channel 2 — an independent sampler voice.",
  "Channel 3 — an independent sampler voice.",
  "Channel 4 — an independent sampler voice, typically used for percussion.",
];

const CHANNEL_NAMES = ["Channel 1", "Channel 2", "Channel 3", "Channel 4"];

function hex2(value: number): string {
  return value.toString(16).toUpperCase().padStart(2, "0");
}

function instrumentDescription(song: SongModel, index: number): string {
  const ins = song.instruments[index];
  if (!ins) return `instrument ${index}`;
  return ins.name || `#${index}`;
}

export function patternsExplain(song: SongModel): ExplainerText {
  return {
    title: "Patterns — the actual note data",
    body: `All four channels at one order position, like the tracker's own view. Each has its own order list (${song.meta.orderLength} positions) of ${song.meta.patternLength}-row patterns.\n\nRow shading follows this song's highlights (${song.meta.highlightA}/${song.meta.highlightB}). OFF = note off; ... / .. / .... = empty note / ins-vol / effect.`,
  };
}

export function rowExplain(
  song: SongModel,
  order: number,
  row: number,
): ExplainerText {
  const rowDur = rowDurationSec(song.meta);
  const absRow = order * song.meta.patternLength + row;
  return {
    title: `Row ${hex2(row)} · order ${order}`,
    body: `At ${song.meta.bpm} BPM (${song.meta.highlightA} rows/beat, ${
      song.meta.highlightB
    } rows/bar), lands ~${(absRow * rowDur).toFixed(
      2,
    )}s into the song. Move here to audition the row.`,
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
  return {
    title: `Instrument ${index.toString().padStart(2, "0")} · ${ins?.name ?? ""}`,
    body: "A sampler / Spectral / Percussion instrument. Rename it from the Sampler menu's Name parameter; a adds a new instrument and d deletes the selected one (with confirmation).",
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
        body: "A legacy macro-release marker; treated as a note release.",
      };
    }
    if (note.kind === "rawFreq") {
      return {
        title: `${label} · FRQ ${note.value}`,
        body: `Direct frequency override of ${note.value} Hz.`,
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
  const base = !column
    ? channelExplain(
        song,
        cursor.channel,
        state.channelMuted[cursor.channel] ?? false,
      )
    : cellExplain(
        song,
        cursor.channel,
        cursor.order,
        cursor.row,
        column,
        cellAt(song, cursor.channel, cursor.order, cursor.row),
      );
  return { ...base, body: `${base.body}\n\n${trackerActionHint(state)}` };
}

/**
 * Short "what can I do here" line for the tracker cursor. Shared by the
 * explainer and the status bar so the two can never drift.
 */
export function trackerActionHint(state: SessionState): string {
  const song = state.song;
  if (!song) return "space play · / commands · ? help";
  if (state.selectionAnchor) {
    return "e copy · t cut · r paste · R flood-paste · esc clear selection";
  }
  const column = flatColumnsForChannel(song, state.cursor.channel)[
    state.cursor.column
  ];
  switch (column?.kind) {
    case "note":
      return "z last value · v instrument · enter actions · ctrl+space audition";
    case "ins":
      return "q/a or ←→ adjust · v instrument · enter actions";
    case "vol":
      return "q/a or ←→ adjust volume · enter actions";
    case "fx":
      return "q/a or ←→ adjust · w/s effect value · enter actions";
    default:
      return "arrows move · o orders · / commands · ? help";
  }
}
