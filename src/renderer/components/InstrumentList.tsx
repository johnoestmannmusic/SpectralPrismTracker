import type { SongModel } from "@/core/songModel";
import type { SamplerSettings } from "@/core/sampler";

interface InstrumentListProps {
  song: SongModel;
  settings: SamplerSettings[];
  sampleNames: string[];
  onUpdate: (index: number, patch: Partial<SamplerSettings>) => void;
  onPreview: (index: number) => void;
}

function linearToDb(value: number): string {
  if (value <= 0) return "-∞";
  return (20 * Math.log10(value)).toFixed(1);
}

export function InstrumentList(props: InstrumentListProps) {
  const { song, settings, sampleNames } = props;
  return (
    <section className="panel">
      <h2>INSTRUMENTS</h2>
      <p className="hint">Preview, transpose, volume, source sample and per-instrument settings.</p>
      <div className="instruments">
        {song.instruments.map((instrument, i) => {
          const setting = settings[i];
          if (!setting) return null;
          const [r, g, b] = instrument.colorRgb;
          return (
            <div className="instrument-row" key={i}>
              <span
                className="swatch"
                style={{ background: `rgb(${r},${g},${b})` }}
                title="Instrument colour"
              />
              <span className="mono index">{i.toString().padStart(2, "0")}</span>
              <span className="ins-name" title={instrument.name}>
                {instrument.name || `Instrument ${i}`}
              </span>

              <button onClick={() => props.onUpdate(i, { muted: !setting.muted })}>
                {setting.muted ? "Unmute" : "Mute"}
              </button>

              <button onClick={() => props.onUpdate(i, { transpose: setting.transpose - 1 })}>
                −
              </button>
              <span className="mono transpose">{setting.transpose.toFixed(0)} st</span>
              <button onClick={() => props.onUpdate(i, { transpose: setting.transpose + 1 })}>
                +
              </button>

              <span className="mono volume">{linearToDb(setting.volume)} dB</span>

              <select
                value={setting.sourceIndex === null ? "" : String(setting.sourceIndex)}
                onChange={(e) => props.onUpdate(i, { sourceIndex: e.target.value === "" ? null : Number(e.target.value) })}
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
            </div>
          );
        })}
      </div>
    </section>
  );
}
