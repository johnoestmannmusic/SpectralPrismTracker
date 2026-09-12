import { useRef, useState } from "react";
import type { AudioBackend } from "@/audio/backend";
import { useAnimationFrame } from "../hooks";

const CHANNEL_NAMES = ["Pulse 1", "Pulse 2", "Wave", "Noise"];

interface MixerProps {
  backend: AudioBackend;
  channelVolume: number[];
  channelMuted: boolean[];
  masterVolume: number;
  onChannelVolume: (channel: number, volume: number) => void;
  onChannelMute: (channel: number, muted: boolean) => void;
  onMasterVolume: (volume: number) => void;
}

function linearToDb(value: number): string {
  if (value <= 0) return "-∞";
  return (20 * Math.log10(value)).toFixed(1);
}

function Meter({ level, master = false }: { level: number; master?: boolean }) {
  const db = level > 0 ? 20 * Math.log10(level) : -Infinity;
  const width = `${Math.min(level, 1) * 100}%`;
  return (
    <div className={`meter${master ? " master" : ""}`} title={`${db.toFixed(1)} dB`}>
      <div
        className={`meter-fill${level >= 0.98 ? " clip" : ""}`}
        style={{ width }}
      />
    </div>
  );
}

export function Mixer(props: MixerProps) {
  const [meters, setMeters] = useState([0, 0, 0, 0, 0]);
  const hold = useRef([0, 0, 0, 0, 0]);

  useAnimationFrame(() => {
    const levels = props.backend.meterLevels();
    const h = hold.current;
    for (let i = 0; i < h.length; i++) {
      h[i] = Math.max(levels[i] ?? 0, (h[i] ?? 0) * 0.85);
    }
    setMeters(h.slice());
  });

  return (
    <section className="panel">
      <h2>MIXER</h2>
      {[0, 1, 2, 3].map((c) => (
        <div className="row mixer-row" key={c}>
          <label className="mute" title={CHANNEL_NAMES[c]}>
            <input
              type="checkbox"
              checked={props.channelMuted[c] ?? false}
              onChange={(e) => props.onChannelMute(c, e.target.checked)}
            />
            CH{c}
          </label>
          <input
            type="range"
            min={0}
            max={1.5}
            step={0.01}
            value={props.channelVolume[c] ?? 1}
            onChange={(e) => props.onChannelVolume(c, Number(e.target.value))}
          />
          <span className="mono db">{linearToDb(props.channelVolume[c] ?? 1)} dB</span>
          <Meter level={meters[c] ?? 0} />
        </div>
      ))}
      <div className="row mixer-row master-row">
        <span className="mute">MASTER</span>
        <input
          type="range"
          min={0}
          max={1.5}
          step={0.01}
          value={props.masterVolume}
          onChange={(e) => props.onMasterVolume(Number(e.target.value))}
        />
        <span className="mono db">{linearToDb(props.masterVolume)} dB</span>
        <Meter level={meters[4] ?? 0} master />
      </div>
    </section>
  );
}
