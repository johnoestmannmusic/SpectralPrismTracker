import { Box, Text, useInput } from "ink";
import { useState } from "react";
import { defaultMasterFx } from "@/core/masterFx";
import type { Session } from "../session";
import { useSession } from "../hooks";

interface Props {
  session: Session;
  active: boolean;
  onClose: () => void;
}

interface Row {
  label: string;
  get: () => number;
  set: (value: number) => void;
  toggle?: () => void;
  getEnabled?: () => boolean;
  meterIndex?: number;
}

function bar(value: number, width = 16): string {
  const filled = Math.round(Math.min(Math.max(value, 0), 1) * width);
  return `${"█".repeat(filled)}${"░".repeat(width - filled)}`;
}

export function MixerOverlay({ session, active, onClose }: Props) {
  const state = useSession(session);
  const [index, setIndex] = useState(0);

  const volumes = state.channelVolume;
  const masterFx = state.masterFx ?? defaultMasterFx();
  const rows: Row[] = [];
  for (let channel = 0; channel < 4; channel++) {
    rows.push({
      label: `CH${channel + 1}${state.channelMuted[channel] ? " (muted)" : ""}`,
      get: () => volumes[channel] ?? 1,
      set: (value) => session.setChannelVolume(channel, value),
      toggle: () => session.toggleChannelMute(channel),
      getEnabled: () => !state.channelMuted[channel],
      meterIndex: channel,
    });
  }
  rows.push({
    label: "MASTER",
    get: () => state.masterVolume,
    set: (value) => session.setMasterVolume(value),
    meterIndex: 4,
  });
  rows.push({
    label: `DELAY${masterFx.delay.enabled ? "" : " (off)"}`,
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

  useInput(
    (char, key) => {
      if (key.escape || char === "q") {
        onClose();
        return;
      }
      if (key.upArrow) {
        setIndex((value) => Math.max(0, value - 1));
        return;
      }
      if (key.downArrow) {
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
        else row.set(row.get() - 0.05);
        return;
      }
      if (key.rightArrow) {
        if (row.toggle && !row.getEnabled?.()) row.toggle();
        else row.set(row.get() + 0.05);
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
      <Text dimColor>↑↓ select · ←→ adjust · m mute/toggle · esc close</Text>
      {rows.map((row, rowIndex) => {
        const value = row.get();
        const cursor = rowIndex === selected;
        const enabled = row.getEnabled?.() ?? true;
        return (
          <Box key={row.label}>
            <Text
              color={cursor ? "black" : undefined}
              backgroundColor={cursor ? "white" : undefined}
            >
              {row.label.padEnd(14)}
            </Text>
            <Text> </Text>
            <Text color={enabled ? "green" : "gray"}>
              {enabled ? bar(value) : "·".repeat(16)}
            </Text>
            <Text dimColor> {(value * 100).toFixed(0).padStart(3)}%</Text>
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
