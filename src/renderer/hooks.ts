import { useEffect, useRef } from "react";

/** Runs `callback` on every animation frame; the callback may be replaced. */
export function useAnimationFrame(callback: (dt: number) => void): void {
  const ref = useRef(callback);
  ref.current = callback;
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      ref.current(dt);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
}
