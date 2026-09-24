/**
 * Output sink for the browser shims.
 *
 * Ink and its dependencies occasionally write to `process.stdout`/`stderr`
 * (cursor escapes, warnings, `cli-cursor`) rather than to the stream passed to
 * `render()`. The web bootstrap registers the local xterm here so those writes
 * still land in the same terminal instead of being dropped.
 */

type Sink = (chunk: string) => void;

let sink: Sink | null = null;

/** Points the shims at the active terminal output. */
export function setShimSink(next: Sink | null): void {
  sink = next;
}

/** Writes a chunk through the registered sink (never throws). */
export function writeShim(chunk: unknown): boolean {
  if (sink && chunk !== undefined && chunk !== null) {
    const text =
      typeof chunk === "string"
        ? chunk
        : chunk instanceof Uint8Array
          ? new TextDecoder().decode(chunk)
          : String(chunk);
    try {
      sink(text);
    } catch {
      /* the terminal may be torn down; ignore */
    }
  }
  return true;
}
