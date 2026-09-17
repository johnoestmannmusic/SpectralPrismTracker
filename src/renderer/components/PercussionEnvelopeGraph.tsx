import { useEffect, useRef } from "react";
import type { PercussionSettings } from "@/core/spectral";

const MAX_PITCH = 24;
const PAD = 5;

/**
 * Read-only graph of the percussion post-stage's two envelopes: the pitch
 * envelope (`pitchStart`→`pitchEnd` with an exponential `pitchDecay`) and the
 * amplitude decay (`ampDecay`). Modelled on `AdsrGraph` but not draggable —
 * the sliders are the input surface.
 */
export function PercussionEnvelopeGraph({
  settings,
}: {
  settings: PercussionSettings;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const draw = () => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const cssWidth = wrap.clientWidth || 300;
    const cssHeight = 84;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.floor(cssWidth * dpr));
    canvas.height = Math.max(1, Math.floor(cssHeight * dpr));
    canvas.style.width = `${cssWidth}px`;
    canvas.style.height = `${cssHeight}px`;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const styles = getComputedStyle(document.documentElement);
    const bg = styles.getPropertyValue("--deep").trim() || "#0a0a0b";
    const accent = styles.getPropertyValue("--accent").trim() || "#6cd73c";
    const secondary =
      styles.getPropertyValue("--secondary").trim() || "#bdbdbd";

    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, cssWidth, cssHeight);

    const h = cssHeight;
    const length = Math.max(settings.lengthSeconds, 0.03);
    const xAt = (t: number) => (t / length) * cssWidth;
    const ampY = (level: number) => h - PAD - level * (h - 2 * PAD);
    const pitchY = (semitones: number) =>
      h - PAD - ((semitones + MAX_PITCH) / (2 * MAX_PITCH)) * (h - 2 * PAD);

    const steps = 96;
    // Amplitude envelope.
    ctx.beginPath();
    for (let i = 0; i <= steps; i++) {
      const t = (i / steps) * length;
      const level = Math.exp(-t / Math.max(settings.ampDecay, 1e-4));
      const x = xAt(t);
      const y = ampY(level);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = accent;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Pitch envelope.
    ctx.beginPath();
    for (let i = 0; i <= steps; i++) {
      const t = (i / steps) * length;
      const semis =
        settings.pitchEnd +
        (settings.pitchStart - settings.pitchEnd) *
          Math.exp(-t / Math.max(settings.pitchDecay, 1e-4));
      const x = xAt(t);
      const y = pitchY(semis);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = secondary;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 4]);
    ctx.stroke();
    ctx.setLineDash([]);
  };

  useEffect(() => {
    draw();
    const wrap = wrapRef.current;
    if (!wrap || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => draw());
    observer.observe(wrap);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    settings.pitchStart,
    settings.pitchEnd,
    settings.pitchDecay,
    settings.ampDecay,
    settings.lengthSeconds,
  ]);

  return (
    <div className="percussion-graph" ref={wrapRef}>
      <canvas
        ref={canvasRef}
        className="percussion-canvas"
        title="Pitch envelope (dashed) and amplitude decay (solid) over the one-shot length"
      />
    </div>
  );
}
