import { Fragment, useState } from "react";
import type { SongModel } from "@/core/songModel";
import { noteToName } from "@/core/pitch";
import { songPositionAt } from "@/core/timing";
import type { AudioBackend } from "@/audio/backend";
import { useAnimationFrame } from "../hooks";

interface PatternGridProps {
  song: SongModel;
  backend: AudioBackend;
}

const CHANNEL_NAMES = ["PULSE 1", "PULSE 2", "WAVE", "NOISE"];

function hex(value: number | null): string {
  return value === null ? ".." : value.toString(16).toUpperCase().padStart(2, "0");
}

function effectText(effect: { effect: number | null; value: number | null }): string {
  if (effect.effect === null && effect.value === null) return "....";
  return `${hex(effect.effect)}${hex(effect.value)}`;
}

export function PatternGrid({ song, backend }: PatternGridProps) {
  const [order, setOrder] = useState(0);
  const [row, setRow] = useState(0);

  useAnimationFrame(() => {
    const pos = songPositionAt(song, backend.currentTime());
    setOrder(pos.orderPos);
    setRow(pos.row);
  });

  const channels = song.channels.slice(0, 4);
  const patternLength = song.meta.patternLength;

  return (
    <section className="panel">
      <h2>PATTERNS</h2>
      <p className="hint">
        {song.meta.orderLength} patterns × {patternLength} rows · read-only view (EDIT MODE is a
        later milestone)
      </p>
      <div className="tracker">
        <table>
          <thead>
            <tr>
              <th className="row-col">ROW</th>
              {channels.map((_, c) => (
                <th key={c} colSpan={4}>
                  CH{c} · {CHANNEL_NAMES[c]}
                </th>
              ))}
            </tr>
            <tr className="sub-head">
              <th />
              {channels.map((_, c) => (
                <Fragment key={c}>
                  <th>NOTE</th>
                  <th>INS</th>
                  <th>VOL</th>
                  <th>FX</th>
                </Fragment>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: patternLength }, (_, r) => {
              const isPlayhead = r === row;
              return (
                <tr key={r} className={isPlayhead ? "playhead" : r % 4 === 0 ? "beat" : ""}>
                  <td className="row-col mono">{r.toString(16).toUpperCase().padStart(2, "0")}</td>
                  {channels.map((channel, c) => {
                    const patternIndex = channel.orderList[order];
                    const pattern =
                      patternIndex === undefined ? undefined : channel.patterns.get(patternIndex);
                    const cell = pattern?.rows[r];
                    const note = cell?.note ?? null;
                    return (
                      <Fragment key={c}>
                        <td className={`mono note${note && note.kind === "note" ? " on" : ""}`}>
                          {note ? noteToName(note) : "..."}
                        </td>
                        <td className="mono">{hex(cell?.instrument ?? null)}</td>
                        <td className="mono">{hex(cell?.volume ?? null)}</td>
                        <td className="mono fx">{cell ? effectText(cell.effects[0]!) : "...."}</td>
                      </Fragment>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
