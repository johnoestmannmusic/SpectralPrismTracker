import type { SongModel, InstrumentInfo } from "@/core/songModel";
import type { SamplerSettings } from "@/core/sampler";
import { useExplainer } from "../explainer";
import { dbToLinear, formatDb, hexToRgb, rgbToHex } from "../util";

interface InstrumentListProps {
  song: SongModel;
  settings: SamplerSettings[];
  sampleNames: string[];
  onUpdate: (index: number, patch: Partial<SamplerSettings>) => void;
  onUpdateInstrument: (index: number, patch: Partial<InstrumentInfo>) => void;
  onTranspose: (index: number, delta: number) => void;
  onPreview: (index: number) => void;
  onOpenEditor: (index: number, spectral: boolean) => void;
}

export function InstrumentList(props: InstrumentListProps) {
  const { song, settings, sampleNames } = props;
  const explain = useExplainer();
  return (
    <section className="panel">
      <h2>INSTRUMENTS</h2>
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
                onMouseEnter={() =>
                  explain({
                    title: `INSTRUMENT ${i.toString().padStart(2, "0")}`,
                    body: `${instrument.name || "Unnamed"} is a Furnace instrument. Its colour follows held notes through the tracker, piano and cover scans; the quick controls share state with its movable Sampler and Spectral window.`,
                  })
                }
              />

              <button onClick={() => props.onTranspose(i, -1)} title="Transpose down and preview">
                −
              </button>
              <span className="mono transpose">{setting.transpose.toFixed(0)} st</span>
              <button onClick={() => props.onTranspose(i, 1)} title="Transpose up and preview">
                +
              </button>

              <label className="db-field" title="Instrument level">
                <input
                  type="number"
                  step={0.1}
                  value={Number(formatDb(setting.volume))}
                  onChange={(e) =>
                    props.onUpdate(i, { volume: Math.min(Math.max(dbToLinear(Number(e.target.value)), 0), 1.5) })
                  }
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
            </div>
          );
        })}
      </div>
    </section>
  );
}
