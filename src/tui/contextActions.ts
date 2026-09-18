import { cellAt } from "@/core/songModel";
import { FX_CATALOG, flatColumnsForChannel } from "@/core/tracker";
import type { SamplerSettings } from "@/core/sampler";
import type { SessionState } from "./session";

/**
 * A cursor "target" for which we can enumerate the actions a user might want.
 * The tracker cell, an instrument row, a source-sample slot and an order each
 * resolve to a different action list; the same resolver feeds every surface so
 * the docs, the menus and the control socket cannot drift.
 */
export type ContextTarget =
  | {
      kind: "tracker";
      channel: number;
      order: number;
      row: number;
      column: number;
    }
  | { kind: "instrument"; index: number }
  | { kind: "sample"; slot: number }
  | { kind: "order"; order: number };

/**
 * One entry in an ActionMenu. `command` is a slash command string executed
 * through the registry (the automation contract); `special` is a UI action the
 * hosting component handles itself (inline rename, destructive confirm, …)
 * because it needs local state.
 */
export interface ContextAction {
  id: string;
  label: string;
  hint?: string;
  /** Accelerator keys that already do this from the host surface. */
  keys?: string[];
  enabled?: boolean;
  command?: string;
  special?: string;
}

function instrumentTabFor(
  settings: SamplerSettings | undefined,
): "sampler" | "spectral" | "percussion" {
  if (settings?.spectral.percussion.enabled) return "percussion";
  if (settings?.spectral.enabled) return "spectral";
  return "sampler";
}

function pad(index: number): string {
  return String(index).padStart(2, "0");
}

/** Actions available on a tracker cell / block selection. */
function trackerActions(
  state: SessionState,
  target: Extract<ContextTarget, { kind: "tracker" }>,
): ContextAction[] {
  const { song, settings } = state;
  if (!song) return [];
  const channel = song.channels[target.channel];
  const cell = cellAt(song, target.channel, target.order, target.row);
  const held = channel?.insTimeline[target.order]?.[target.row] ?? null;
  const instrument = cell?.instrument ?? held ?? null;
  const setting =
    instrument !== null ? (settings[instrument] ?? undefined) : undefined;
  const column = flatColumnsForChannel(song, target.channel)[target.column];

  const actions: ContextAction[] = [
    {
      id: "audition",
      label: "Audition this row",
      keys: ["ctrl+space"],
      command: "/playcursor",
    },
  ];

  if (instrument !== null) {
    const tab = instrumentTabFor(setting);
    actions.push({
      id: "edit-instrument",
      label: `Edit instrument ${pad(instrument)} (${tab})`,
      keys: ["v"],
      command: `/${tab} ${instrument}`,
    });
    if (setting?.sourceIndex !== null && setting?.sourceIndex !== undefined) {
      actions.push({
        id: "open-sample",
        label: `Open source sample ${setting.sourceIndex}`,
        command: `/sourcesamples ${setting.sourceIndex}`,
      });
    }
  }
  actions.push({
    id: "instruments",
    label: "Instrument list…",
    command: "/instruments",
  });

  if (column?.kind === "note" && cell?.note?.kind === "note") {
    actions.push({
      id: "note-off",
      label: "Note off here",
      keys: ["c"],
      command: "/noteoff",
    });
  }
  actions.push({
    id: "clear",
    label: "Clear cell",
    keys: ["x"],
    command: "/clear",
  });

  actions.push(
    {
      id: "copy",
      label: "Copy block / cell",
      keys: ["e", "e"],
      command: "/copy",
    },
    { id: "cut", label: "Cut block", keys: ["t"], command: "/cut" },
    { id: "paste", label: "Paste", keys: ["r"], command: "/paste" },
    {
      id: "flood",
      label: "Flood-paste to end of pattern",
      keys: ["R"],
      command: "/paste --flood",
    },
    {
      id: "interpolate",
      label: "Interpolate columns",
      command: "/interpolate",
    },
    { id: "transpose-up", label: "Transpose +1", command: "/transpose 1" },
    { id: "transpose-down", label: "Transpose -1", command: "/transpose -1" },
    { id: "goto-order", label: "Go to order…", special: "order-picker" },
  );

  // On an effect column, lead with the FX type picker (Enter on FX).
  if (column?.kind === "fx") {
    const fxActions: ContextAction[] = [
      { id: "fx-clear", label: "Clear effect", special: "clear-fx" },
      ...FX_CATALOG.map((entry) => ({
        id: `fx-${entry.code}`,
        label: `${entry.label} — ${entry.description}`,
        special: `set-fx:${entry.code}`,
      })),
    ];
    return [...fxActions, ...actions];
  }
  return actions;
}

/** Actions available on an instrument list row. */
function instrumentActions(
  state: SessionState,
  target: Extract<ContextTarget, { kind: "instrument" }>,
): ContextAction[] {
  const index = target.index;
  const setting = state.settings[index];
  if (!setting) return [];
  const actions: ContextAction[] = [
    {
      id: "sampler",
      label: "Edit Sampler",
      keys: ["1"],
      command: `/sampler ${index}`,
    },
    {
      id: "spectral",
      label: "Edit Spectral",
      keys: ["2"],
      command: `/spectral ${index}`,
    },
    {
      id: "percussion",
      label: "Edit Percussion",
      keys: ["3"],
      command: `/percussion ${index}`,
    },
    { id: "rename", label: "Rename…", special: "rename-instrument" },
    {
      id: "duplicate",
      label: "Duplicate instrument",
      command: `/duplicateinstrument ${index}`,
    },
    {
      id: "mute",
      label: setting.muted ? "Unmute" : "Mute",
      keys: ["m"],
      command: `/muteinstrument ${index}`,
    },
    {
      id: "preview",
      label: "Preview",
      keys: ["p"],
      command: `/previewinstrument ${index}`,
    },
  ];
  if (setting.sourceIndex !== null) {
    actions.push({
      id: "open-sample",
      label: `Open source sample ${setting.sourceIndex}`,
      command: `/sourcesamples ${setting.sourceIndex}`,
    });
  }
  actions.push({
    id: "delete",
    label: "Delete instrument…",
    keys: ["d"],
    special: "delete-instrument",
    enabled: state.settings.length > 1,
  });
  return actions;
}

/** Actions available on a source-sample slot. */
function sampleActions(
  state: SessionState,
  target: Extract<ContextTarget, { kind: "sample" }>,
): ContextAction[] {
  const slot = target.slot;
  return [
    {
      id: "preview",
      label: "Preview sample",
      keys: ["p"],
      command: `/preview ${slot}`,
    },
    {
      id: "edit",
      label: "Rename & info…",
      keys: ["enter"],
      special: "edit-sample",
    },
    {
      id: "new-instrument",
      label: "New instrument from this sample",
      command: `/newinstrumentfromsample ${slot}`,
    },
    {
      id: "import",
      label: "Import an audio file into this slot…",
      special: "import-sample",
    },
    {
      id: "instruments",
      label: "Open instrument list",
      command: "/instruments",
    },
  ];
}

/** Actions available on an order position. */
function orderActions(
  _state: SessionState,
  target: Extract<ContextTarget, { kind: "order" }>,
): ContextAction[] {
  const order = target.order;
  return [
    {
      id: "jump",
      label: `Jump to order ${pad(order)}`,
      command: `/goto ${order}`,
    },
    { id: "insert", label: "Insert order after", command: `/insert` },
    { id: "duplicate", label: "Duplicate order", command: `/insert --clone` },
    { id: "remove", label: "Remove order", command: "/remove" },
    { id: "move-up", label: "Move order up", command: `/move up ${order}` },
    {
      id: "move-down",
      label: "Move order down",
      command: `/move down ${order}`,
    },
    { id: "patterns", label: "Open Pattern Manager", command: "/patterns" },
  ];
}

/** Enumerates the actions available for a context target. Pure function. */
export function contextActions(
  state: SessionState,
  target: ContextTarget,
): ContextAction[] {
  switch (target.kind) {
    case "tracker":
      return trackerActions(state, target);
    case "instrument":
      return instrumentActions(state, target);
    case "sample":
      return sampleActions(state, target);
    case "order":
      return orderActions(state, target);
  }
}
