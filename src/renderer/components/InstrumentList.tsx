import { useState } from "react";
import type { SongModel, InstrumentInfo } from "@/core/songModel";
import type { SamplerSettings } from "@/core/sampler";
import { useExplainer } from "../explainer";
import { hexToRgb, rgbToHex } from "../util";
import { DbInput } from "./DbInput";
import {
  instrumentExplain,
  instrumentsExplain,
  instrumentVolumeExplain,
  transposeExplain,
} from "../explainerContent";

interface InstrumentListProps {
  song: SongModel;
  settings: SamplerSettings[];
  sampleNames: string[];
  onUpdate: (index: number, patch: Partial<SamplerSettings>) => void;
  onUpdateInstrument: (index: number, patch: Partial<InstrumentInfo>) => void;
  onTranspose: (index: number, delta: number) => void;
  onPreview: (index: number) => void;
  onOpenEditor: (index: number, spectral: boolean) => void;
  onAddInstrument: () => void;
  onRequestDelete: (index: number) => void;
}

export function InstrumentList(props: InstrumentListProps) {
  const { song, settings, sampleNames } = props;
  const explain = useExplainer();
  const [menuIndex, setMenuIndex] = useState<number | null>(null);
  return (
    <section className="panel">
      <h2 style={{ cursor: "help" }} onMouseEnter={() => explain(instrumentsExplain(song))}>INSTRUMENTS</h2>
      <p className="hint">Quick edits stay synchronized with the movable Sampler/Spectral windows.</p>
      <div className="instruments">
        {song.instruments.map((instrument, i) => {
          const setting = settings[i];
          if (!setting) return null;
          return (
            <div className="instrument-row" key={i}>
              <button onClick={() => props.onUpdate(i, { muted: !setting.muted })}>
                {setting.muted ? "Unmute" : "Mute"}
              </button>

              <input
                className="color-swatch"
                type="color"
                value={rgbToHex(instrument.colorRgb)}
                title="Pattern and piano colour"
                onChange={(e) =>
                  props.onUpdateInstrument(i, { colorRgb: hexToRgb(e.target.value) })
                }
              />

              <span className="mono index">{i.toString().padStart(2, "0")}</span>

              <input
                className="ins-name-input"
                value={instrument.name}
                onChange={(e) => props.onUpdateInstrument(i, { name: e.target.value })}
                onMouseEnter={() => explain(instrumentExplain(song, i))}
              />

              <button
                onClick={() => props.onTranspose(i, -1)}
                onMouseEnter={() => explain(transposeExplain())}
                title="Transpose down and preview"
              >
                −
              </button>
              <span className="mono transpose">{setting.transpose.toFixed(0)} st</span>
              <button
                onClick={() => props.onTranspose(i, 1)}
                onMouseEnter={() => explain(transposeExplain())}
                title="Transpose up and preview"
              >
                +
              </button>

              <label
                className="db-field"
                title="Instrument level (0 dB max)"
                onMouseEnter={() => explain(instrumentVolumeExplain())}
              >
                <DbInput
                  value={setting.volume}
                  maxDb={0}
                  onChange={(linear) => props.onUpdate(i, { volume: linear })}
                />
                dB
              </label>

              <select
                value={setting.sourceIndex === null ? "" : String(setting.sourceIndex)}
                onChange={(e) =>
                  props.onUpdate(i, {
                    sourceIndex: e.target.value === "" ? null : Number(e.target.value),
                  })
                }
              >
                <option value="">(none)</option>
                {sampleNames.map((name, slot) =>
                  name ? (
                    <option value={String(slot)} key={slot}>
                      {slot}: {name}
                    </option>
                  ) : null,
                )}
              </select>

              <button onClick={() => props.onPreview(i)}>▶ Preview</button>

              <span className="pill-switch">
                <button
                  className={!setting.spectral.enabled ? "active" : ""}
                  onClick={() => props.onOpenEditor(i, false)}
                >
                  Sampler
                </button>
                <button
                  className={setting.spectral.enabled ? "active" : ""}
                  onClick={() => props.onOpenEditor(i, true)}
                >
                  Spectral
                </button>
              </span>

              <span
                className="instrument-menu-wrap"
                onMouseLeave={() => setMenuIndex((current) => (current === i ? null : current))}
              >
                <button
                  className="hamburger"
                  title="Instrument menu"
                  aria-label={`Instrument ${i} menu`}
                  onClick={() => setMenuIndex(menuIndex === i ? null : i)}
                >
                  ☰
                </button>
                {menuIndex === i && (
                  <div className="instrument-menu">
                    <button
                      className="menu-item"
                      disabled={song.instruments.length <= 1}
                      title={
                        song.instruments.length <= 1
                          ? "At least one instrument is required"
                          : "Delete this instrument and re-target pattern INS cells"
                      }
                      onClick={() => {
                        setMenuIndex(null);
                        props.onRequestDelete(i);
                      }}
                    >
                      Delete instrument…
                    </button>
                  </div>
                )}
              </span>
            </div>
          );
        })}
      </div>
      <button className="add-instrument" onClick={props.onAddInstrument}>
        + Add Instrument
      </button>
    </section>
  );
}
