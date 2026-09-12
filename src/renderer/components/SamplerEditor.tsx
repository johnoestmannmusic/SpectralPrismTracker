import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { SamplerSettings } from "@/core/sampler";
import {
  SPECTRAL_FUSION_MODES,
  spectralModeHasAmount,
  spectralModeLabel,
  spectralModeNeedsB,
  MAX_LOOP_SECONDS,
  MIN_LOOP_SECONDS,
} from "@/core/spectral";
import type { AudioBackend } from "@/audio/backend";
import { useAnimationFrame } from "../hooks";
import { Waveform, type WaveformMarker } from "./Waveform";
import { formatDb } from "../util";

interface SamplerEditorProps {
  backend: AudioBackend;
  index: number;
  name: string;
  color: [number, number, number];
  settings: SamplerSettings;
  sampleNames: string[];
  reference: boolean;
  onReferenceChange: (value: boolean) => void;
  spectralTab: boolean;
  wasmAvailable: boolean;
  onTabChange: (tab: boolean) => void;
  onUpdate: (patch: Partial<SamplerSettings>) => void;
  onClose: () => void;
}

export function SamplerEditor(props: SamplerEditorProps) {
  const { backend, settings } = props;
  const [position, setPosition] = useState({ x: 360, y: 90 });
  const drag = useRef<{ dx: number; dy: number } | null>(null);
  const [duration, setDuration] = useState(0);
  const [peaks, setPeaks] = useState<Array<[number, number]>>([]);
  const [markers, setMarkers] = useState<WaveformMarker[]>([]);
  const [previewing, setPreviewing] = useState(false);

  useAnimationFrame(() => {
    const dur = backend.effectiveDuration(props.index);
    setDuration(dur);
    setPeaks(backend.effectiveWaveform(props.index));
    const color = `rgb(${props.color.join(",")})`;
    setMarkers(
      backend
        .samplePlayheads()
        .filter((p) => p.instrument === props.index && dur > 0)
        .map((p) => ({
          fraction: p.position / dur,
          color,
          label: props.index,
          alpha: p.level,
        })),
    );
    setPreviewing(backend.previewPosition()?.instrument === props.index);
  });

  const title = props.spectralTab
    ? "SpectralPrism | v20260912 | LMP Integrated"
    : `Sampler — ${props.name}`;

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    drag.current = { dx: event.clientX - position.x, dy: event.clientY - position.y };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    setPosition({
      x: Math.max(0, event.clientX - drag.current.dx),
      y: Math.max(0, event.clientY - drag.current.dy),
    });
  };
  const onPointerUp = () => {
    drag.current = null;
  };

  const playable = duration > 0 && settings.endSec > settings.startSec;

  return (
    <div className="floating-window" style={{ left: position.x, top: position.y }}>
      <div
        className="floating-title"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <span>{title}</span>
        <button onClick={props.onClose}>✕</button>
      </div>
      <div className="floating-body">
        <div className="row wrap">
          <strong>{props.spectralTab ? "SPECTRAL" : "SAMPLER"}</strong>
          <label>
            <input
              type="checkbox"
              checked={props.reference}
              onChange={(e) => props.onReferenceChange(e.target.checked)}
            />
            Ref Pitch
          </label>
          <button
            disabled={!playable}
            onClick={() =>
              previewing ? backend.stopPreview() : backend.preview(props.index, props.reference)
            }
          >
            {previewing ? "Stop Preview" : "Preview"}
          </button>
          <label>
            <input
              type="checkbox"
              checked={settings.muted}
              onChange={(e) => props.onUpdate({ muted: e.target.checked })}
            />
            Mute in song
          </label>
        </div>
        <div className="row tabs">
          <button
            className={!props.spectralTab ? "active" : ""}
            onClick={() => props.onTabChange(false)}
          >
            Sampler
          </button>
          <button
            className={props.spectralTab ? "active" : ""}
            onClick={() => props.onTabChange(true)}
          >
            Spectral
          </button>
        </div>

        {props.spectralTab ? (
          <SpectralTab {...props} duration={duration} />
        ) : (
          <div className="editor-tab">
            <Waveform
              peaks={peaks}
              markers={markers}
              height={110}
              trim={{ start: settings.startSec, end: settings.endSec, duration }}
              onTrimChange={(start, end) => props.onUpdate({ startSec: start, endSec: end })}
              emptyLabel="Assign a source sample"
            />
            <div className="row wrap">
              <label>Start (s)</label>
              <input
                type="number"
                step={0.001}
                min={0}
                max={duration}
                value={settings.startSec}
                onChange={(e) =>
                  props.onUpdate({
                    startSec: Math.min(Math.max(Number(e.target.value), 0), duration),
                  })
                }
              />
              <label>End (s)</label>
              <input
                type="number"
                step={0.001}
                min={settings.startSec}
                max={duration}
                value={settings.endSec}
                onChange={(e) =>
                  props.onUpdate({
                    endSec: Math.min(Math.max(Number(e.target.value), settings.startSec), duration),
                  })
                }
              />
              <button onClick={() => props.onUpdate({ startSec: 0, endSec: duration })}>
                Reset Start/End
              </button>
            </div>
            <div className="row wrap">
              <label>Source</label>
              <select
                value={settings.sourceIndex === null ? "" : String(settings.sourceIndex)}
                onChange={(e) =>
                  props.onUpdate({
                    sourceIndex: e.target.value === "" ? null : Number(e.target.value),
                  })
                }
              >
                <option value="">Unassigned</option>
                {props.sampleNames.map((n, slot) =>
                  n ? (
                    <option key={slot} value={String(slot)}>
                      {slot}: {n}
                    </option>
                  ) : null,
                )}
              </select>
              <label>Transpose</label>
              <input
                type="number"
                step={0.01}
                min={-48}
                max={48}
                value={settings.transpose}
                onChange={(e) => props.onUpdate({ transpose: Number(e.target.value) })}
              />
              <label>
                <input
                  type="checkbox"
                  checked={settings.looping}
                  onChange={(e) => props.onUpdate({ looping: e.target.checked })}
                />
                Loop
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={settings.pingPong}
                  disabled={!settings.looping}
                  onChange={(e) => props.onUpdate({ pingPong: e.target.checked })}
                />
                Ping-pong
              </label>
            </div>

            <h3>ENVELOPE</h3>
            <div className="row wrap">
              <Slider label="Attack (s)" value={settings.attack} min={0} max={1} step={0.001} onChange={(v) => props.onUpdate({ attack: v })} />
              <Slider label="Decay (s)" value={settings.decay} min={0} max={1} step={0.001} onChange={(v) => props.onUpdate({ decay: v })} />
            </div>
            <div className="row wrap">
              <Slider label="Sustain" value={settings.sustain} min={0} max={1} step={0.01} onChange={(v) => props.onUpdate({ sustain: v })} />
              <Slider label="Release (s)" value={settings.release} min={0} max={2} step={0.001} onChange={(v) => props.onUpdate({ release: v })} />
            </div>
            <div className="row wrap">
              <Slider label="Volume" value={settings.volume} min={0} max={1.5} step={0.01} onChange={(v) => props.onUpdate({ volume: v })} />
              <span className="mono muted">{formatDb(settings.volume)} dB</span>
              <Slider
                label="Random Pan (%)"
                value={settings.panRandomRange * 100}
                min={0}
                max={100}
                step={1}
                onChange={(v) => props.onUpdate({ panRandomRange: v / 100 })}
              />
              <label>
                <input
                  type="checkbox"
                  checked={settings.polyphonic}
                  onChange={(e) => props.onUpdate({ polyphonic: e.target.checked })}
                />
                Polyphonic
              </label>
              <label>
                Voice cap
                <input
                  type="number"
                  min={1}
                  max={32}
                  value={settings.voiceCap}
                  disabled={!settings.polyphonic}
                  onChange={(e) => props.onUpdate({ voiceCap: Number(e.target.value) })}
                />
              </label>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Slider(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="slider">
      {props.label}
      <input
        type="range"
        min={props.min}
        max={props.max}
        step={props.step}
        value={props.value}
        onChange={(e) => props.onChange(Number(e.target.value))}
      />
      <span className="mono">{props.value.toFixed(3)}</span>
    </label>
  );
}

function SpectralTab(
  props: SamplerEditorProps & { duration: number },
) {
  const { settings, backend } = props;
  const spectral = settings.spectral;
  const fusionReady = backend.fusionReady(props.index);
  const needsB = spectralModeNeedsB(spectral.mode);

  const patchSpectral = (patch: Partial<typeof spectral>) =>
    props.onUpdate({ spectral: { ...spectral, ...patch } });

  const amount =
    spectral.mode === "mix"
      ? spectral.mixAmount
      : spectral.mode === "cross-synth"
        ? spectral.crossSynthAmount
        : spectral.mode === "convolve"
          ? spectral.convolveAmount
          : spectral.ringModAmount;
  const amountKey =
    spectral.mode === "mix"
      ? "mixAmount"
      : spectral.mode === "cross-synth"
        ? "crossSynthAmount"
        : spectral.mode === "convolve"
          ? "convolveAmount"
          : "ringModAmount";

  return (
    <div className="editor-tab">
      <p className="hint">
        {!props.wasmAvailable
          ? "The prism_dsp WASM engine failed to load — Spectral renders are disabled."
          : backend.fusionReady(props.index)
            ? "Rendered result is ready."
            : "Click Render to build this instrument's Spectral loop."}
      </p>
      <div className="row wrap">
        <label>Mode</label>
        <select
          value={spectral.mode}
          onChange={(e) => patchSpectral({ mode: e.target.value as typeof spectral.mode })}
        >
          {SPECTRAL_FUSION_MODES.map((mode) => (
            <option key={mode} value={mode}>
              {spectralModeLabel(mode)}
            </option>
          ))}
        </select>
        <button onClick={() => backend.renderFusion(props.index)}>Render</button>
      </div>

      <h3>Sample A</h3>
      <Slider label="Freeze Point (%)" value={spectral.freezePoint} min={0} max={100} step={1} onChange={(v) => patchSpectral({ freezePoint: v })} />
      <Slider label="Tune (st)" value={spectral.tune} min={-24} max={24} step={0.5} onChange={(v) => patchSpectral({ tune: v })} />
      <Slider label="Volume (%)" value={spectral.volume} min={0} max={100} step={1} onChange={(v) => patchSpectral({ volume: v })} />
      <Slider label="Formant Shift (st)" value={spectral.formantShift} min={-12} max={12} step={0.5} onChange={(v) => patchSpectral({ formantShift: v })} />

      {needsB && (
        <>
          <h3>Sample B</h3>
          <div className="row wrap">
            <label>Source</label>
            <select
              value={spectral.sourceIndex2 === null ? "" : String(spectral.sourceIndex2)}
              onChange={(e) =>
                patchSpectral({
                  sourceIndex2: e.target.value === "" ? null : Number(e.target.value),
                })
              }
            >
              <option value="">Unassigned</option>
              {props.sampleNames.map((n, slot) =>
                n ? (
                  <option key={slot} value={String(slot)}>
                    {slot}: {n}
                  </option>
                ) : null,
              )}
            </select>
          </div>
          <Slider label="Freeze Point B (%)" value={spectral.freezePointB} min={0} max={100} step={1} onChange={(v) => patchSpectral({ freezePointB: v })} />
          <Slider label="Tune B (st)" value={spectral.tuneB} min={-24} max={24} step={0.5} onChange={(v) => patchSpectral({ tuneB: v })} />
          <Slider label="Volume B (%)" value={spectral.volumeB} min={0} max={100} step={1} onChange={(v) => patchSpectral({ volumeB: v })} />
          <Slider label="Formant B (st)" value={spectral.formantShiftB} min={-12} max={12} step={0.5} onChange={(v) => patchSpectral({ formantShiftB: v })} />
        </>
      )}

      {spectralModeHasAmount(spectral.mode) && (
        <Slider
          label="Amount (%)"
          value={amount}
          min={0}
          max={100}
          step={1}
          onChange={(v) => patchSpectral({ [amountKey]: v } as Partial<typeof spectral>)}
        />
      )}
      <Slider label="Stereo Width (%)" value={spectral.stereoWidth} min={0} max={100} step={1} onChange={(v) => patchSpectral({ stereoWidth: v })} />
      <Slider label="Loop Length (s)" value={spectral.loopLengthSeconds} min={MIN_LOOP_SECONDS} max={MAX_LOOP_SECONDS} step={0.1} onChange={(v) => patchSpectral({ loopLengthSeconds: v })} />
      <p className="hint">
        Result waveform: {fusionReady ? `${props.duration.toFixed(2)}s` : "not rendered"}
      </p>
    </div>
  );
}
