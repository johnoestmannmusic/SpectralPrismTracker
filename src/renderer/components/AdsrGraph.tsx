import { useRef, type PointerEvent as ReactPointerEvent } from "react";
import type { SamplerSettings } from "@/core/sampler";

const X_DOMAIN = 4.3;

interface AdsrGraphProps {
  settings: SamplerSettings;
  onChange: (patch: Partial<SamplerSettings>) => void;
}

/**
 * Draggable ADSR envelope graph. Handle order matches the Rust editor:
 * attack peak, decay/sustain knee, then release end.
 */
export function AdsrGraph({ settings, onChange }: AdsrGraphProps) {
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const attack = Math.max(settings.attack, 0.003);
  const decayEnd = attack + settings.decay;
  const holdEnd = decayEnd + 0.3;
  const releaseEnd = holdEnd + settings.release;
  const sustain = Math.min(Math.max(settings.sustain, 0), 1);

  const px = (t: number) => Math.min(Math.max(t / X_DOMAIN, 0), 1);
  const py = (l: number) => 1 - Math.min(Math.max(l, 0), 1);

  // Display-only minimum attack width so a very short attack still shows a
  // visible fade-in; the underlying attack value and drag math are unchanged.
  const MIN_ATTACK_WIDTH = 0.06;
  const rawAttackX = px(attack);
  const attackX = Math.max(rawAttackX, MIN_ATTACK_WIDTH);
  const shift = attackX - rawAttackX;
  const points: Array<[number, number]> = [
    [0, 0],
    [attackX, py(1)],
    [Math.min(px(decayEnd) + shift, 1), py(sustain)],
    [Math.min(px(holdEnd) + shift, 1), py(sustain)],
    [Math.min(px(releaseEnd) + shift, 1), py(0)],
  ];
  const polyline = points.map(([x, y]) => `${x * 100},${y * 100}`).join(" ");

  const startDrag =
    (which: 0 | 1 | 2) => (event: ReactPointerEvent<HTMLDivElement>) => {
      event.stopPropagation();
      const wrap = wrapRef.current;
      if (!wrap) return;
      (event.target as HTMLElement).setPointerCapture(event.pointerId);

      const apply = (clientX: number, clientY: number) => {
        const rect = wrap.getBoundingClientRect();
        const t = Math.min(Math.max((clientX - rect.left) / Math.max(rect.width, 1), 0), 1) * X_DOMAIN;
        const value = Math.min(Math.max(1 - (clientY - rect.top) / Math.max(rect.height, 1), 0), 1);
        if (which === 0) onChange({ attack: Math.min(Math.max(t, 0), 1) });
        else if (which === 1) {
          onChange({ decay: Math.min(Math.max(t - attack, 0), 1), sustain: value });
        } else {
          onChange({ release: Math.min(Math.max(t - holdEnd, 0), 2) });
        }
      };

      apply(event.clientX, event.clientY);
      const onMove = (ev: PointerEvent) => apply(ev.clientX, ev.clientY);
      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    };

  const handles: Array<{ index: 0 | 1 | 2; point: [number, number]; title: string }> = [
    { index: 0, point: points[1]!, title: "Attack" },
    { index: 1, point: points[2]!, title: "Decay / Sustain" },
    { index: 2, point: points[4]!, title: "Release" },
  ];

  return (
    <div className="adsr-wrap" ref={wrapRef} title="Drag the points to shape the envelope">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none">
        <rect x="0" y="0" width="100" height="100" fill="var(--deep)" />
        {/* zero-volume baseline */}
        <line
          x1="0"
          y1="100"
          x2="100"
          y2="100"
          stroke="var(--edge)"
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
        />
        <polyline
          points={polyline}
          fill="none"
          stroke="var(--accent)"
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
        />
        {/* start point at zero volume */}
        <rect x="0" y="99" width="1.6" height="1.6" fill="var(--accent)" />
      </svg>
      {handles.map((handle) => (
        <div
          key={handle.index}
          className="adsr-handle"
          title={handle.title}
          style={{ left: `${handle.point[0] * 100}%`, top: `${handle.point[1] * 100}%` }}
          onPointerDown={startDrag(handle.index)}
        />
      ))}
    </div>
  );
}
