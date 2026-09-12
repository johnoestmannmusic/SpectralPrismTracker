import { useState } from "react";
import type { AudioBackend } from "@/audio/backend";
import { useAnimationFrame } from "../hooks";

/** Inline label for backend decode/render errors, polled cheaply. */
export function AudioError({ backend }: { backend: AudioBackend }) {
  const [message, setMessage] = useState<string | null>(null);

  useAnimationFrame(() => {
    const error = backend.error();
    setMessage((prev) => (prev === error ? prev : error));
  }, 2);

  if (!message) return null;
  return (
    <div className="audio-error" role="alert">
      ⚠ {message}
    </div>
  );
}
