import { Box, Text, useInput } from "ink";
import { useEffect, useState } from "react";
import { defaultMasterFx } from "@/core/masterFx";
import type { Session } from "../session";
import { useSession } from "../hooks";
import type { ExplainerText } from "../explainer";
import type { SessionState } from "../session";
import { isCancel } from "../keys";

interface Props {
  session: Session;
  active: boolean;
  onClose: () => void;
  onExplain?: (content: ExplainerText) => void;
  /** Preview state supplied by stepthrough (defaults to the live session). */
  state?: SessionState;
  /** Stepthrough row to mark (index into the mixer rows). */
  highlightRow?: number;
}

interface Row {
  label: string;
  group: string;
  explain: string;
  get: () => number;
  set: (value: number) => void;
  toggle?: () => void;
  getEnabled?: () => boolean;
  meterIndex?: number;
  /** Arrow-key adjust step (defaults to 0.05). */
  step?: number;
  /** Hide the 0..1 bar and percentage (for non-normalised values). */
  noBar?: boolean;
  format?: (value: number) => string;
}

function bar(value: number, width = 16): string {
  const filled = Math.round(Math.min(Math.max(value, 0), 1) * width);
  return `${"█".repeat(filled)}${"░".repeat(width - filled)}`;
}

export function MixerOverlay({
  session,
  active,
  onClose,
  onExplain,
  state: stateOverride,
  highlightRow,
}: Props) {
  const live = useSession(session);
  const state = stateOverride ?? live;
  const [index, setIndex] = useState(0);

  const volumes = state.channelVolume;
  const masterFx = state.masterFx ?? defaultMasterFx();
  const rows: Row[] = [];
  for (let channel = 0; channel < 4; channel++) {
    rows.push({
      label: `CH${channel + 1}${state.channelMuted[channel] ? " (muted)" : ""}`,
      group: "channels",
      explain:
        "Per-channel volume before the master bus. Independent of the instrument mute; both multiply.",
      get: () => volumes[channel] ?? 1,
      set: (value) => session.setChannelVolume(channel, value),
      toggle: () => session.toggleChannelMute(channel),
      getEnabled: () => !state.channelMuted[channel],
      meterIndex: channel,
    });
  }
  // Per-channel phase / speed / drift moved to /fx → Channel Phasing (FEAT-143).
  rows.push({
    label: "MASTER",
    group: "master",
    explain:
      "Final output stage. If it clips with channels under 100%, turn individual channels down rather than the master.",
    get: () => state.masterVolume,
    set: (value) => session.setMasterVolume(value),
    meterIndex: 4,
  });
  rows.push({
    label: `DELAY${masterFx.delay.enabled ? "" : " (off)"}`,
    group: "delay",
    explain:
      "Master delay: time, feedback, tone and mix. ←→ sets mix; m toggles the effect.",
    get: () => masterFx.delay.mix,
    set: (value) =>
      session.setMasterFx({
        ...masterFx,
        delay: { ...masterFx.delay, mix: value },
      }),
    toggle: () =>
      session.setMasterFx({
        ...masterFx,
        delay: { ...masterFx.delay, enabled: !masterFx.delay.enabled },
      }),
    getEnabled: () => masterFx.delay.enabled,
  });
  rows.push({
    label: `REVERB${masterFx.reverb.enabled ? "" : " (off)"}`,
    group: "reverb",
    explain: "Master reverb: decay and mix. ←→ sets mix; m toggles the effect.",
    get: () => masterFx.reverb.mix,
    set: (value) =>
      session.setMasterFx({
        ...masterFx,
        reverb: { ...masterFx.reverb, mix: value },
      }),
    toggle: () =>
      session.setMasterFx({
        ...masterFx,
        reverb: { ...masterFx.reverb, enabled: !masterFx.reverb.enabled },
      }),
    getEnabled: () => masterFx.reverb.enabled,
  });

  const selected = Math.min(index, rows.length - 1);
  const meters = session.meterLevels();
  const groupStarts = (() => {
    const starts: number[] = [];
    let last: string | null = null;
    rows.forEach((row, rowIndex) => {
      if (row.group !== last) {
        starts.push(rowIndex);
        last = row.group;
      }
    });
    return starts;
  })();

  useEffect(() => {
    if (!onExplain) return;
    const row = rows[Math.min(index, rows.length - 1)];
    if (!row) return;
    onExplain({ title: `Mixer · ${row.label}`, body: row.explain });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, onExplain]);

  useInput(
    (char, key) => {
      if (isCancel(char, key) || char === "q") {
        onClose();
        return;
      }
      if (key.upArrow) {
        if (key.ctrl) {
          const previous = groupStarts.filter((start) => start < selected);
          setIndex(previous[previous.length - 1] ?? 0);
          return;
        }
        setIndex((value) => Math.max(0, value - 1));
        return;
      }
      if (key.downArrow) {
        if (key.ctrl) {
          const next = groupStarts.find((start) => start > selected);
          setIndex(next ?? rows.length - 1);
          return;
        }
        setIndex((value) =>
          rows.length === 0
            ? 0
            : Math.max(0, Math.min(rows.length - 1, value + 1)),
        );
        return;
      }
      const row = rows[selected]!;
      if (key.leftArrow) {
        if (row.toggle && !row.getEnabled?.()) row.toggle();
        else row.set(row.get() - (row.step ?? 0.05));
        return;
      }
      if (key.rightArrow) {
        if (row.toggle && !row.getEnabled?.()) row.toggle();
        else row.set(row.get() + (row.step ?? 0.05));
        return;
      }
      if (char === "m" && row.toggle) {
        row.toggle();
        return;
      }
      if (char === "M") {
        row.set(0);
        return;
      }
    },
    { isActive: active },
  );

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="cyan"
      paddingX={1}
    >
      <Text bold color="cyan">
        Mixer / Master FX
      </Text>
      <Text dimColor>
        ↑↓ select · ctrl+↑↓ category · ←→ adjust · m mute/toggle · esc close
      </Text>
      {rows.map((row, rowIndex) => {
        const value = row.get();
        const cursor = rowIndex === selected;
        const marked = rowIndex === highlightRow;
        const enabled = row.getEnabled?.() ?? true;
        return (
          <Box key={row.label}>
            <Text
              color={marked && !cursor ? "yellow" : undefined}
              bold={marked}
            >
              {marked ? "◆" : " "}
            </Text>
            <Text
              color={cursor ? "black" : marked ? "yellow" : undefined}
              backgroundColor={cursor ? "white" : undefined}
            >
              {row.label.padEnd(14)}
            </Text>
            <Text> </Text>
            <Text color={enabled ? "green" : "gray"}>
              {row.noBar
                ? (row.format?.(value) ?? String(value))
                : enabled
                  ? bar(value)
                  : "·".repeat(16)}
            </Text>
            {row.noBar ? null : (
              <Text dimColor> {(value * 100).toFixed(0).padStart(3)}%</Text>
            )}
            <Text dimColor>
              {" "}
              {row.meterIndex !== undefined
                ? `peak ${(meters[row.meterIndex] ?? 0).toFixed(2)}`
                : ""}
            </Text>
          </Box>
        );
      })}
    </Box>
  );
}
