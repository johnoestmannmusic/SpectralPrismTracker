/**
 * Browser-side terminal streams for Ink (FEAT-105).
 *
 * Ink renders to a Node `WriteStream` and reads from a Node `ReadStream`. These
 * lightweight shims reproduce just enough of that surface for Ink to run
 * against an in-browser terminal (xterm.js): `write`/`columns`/`rows`/`resize`
 * on the output side and `read`/`setEncoding`/`readable` events/`setRawMode` on
 * the input side. No `node:stream` import, so it is safe in the browser bundle.
 */

type Listener = (...args: unknown[]) => void;

class Emitter {
  private listeners = new Map<string, Set<Listener>>();

  on(event: string, listener: Listener): this {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(listener);
    return this;
  }

  addListener(event: string, listener: Listener): this {
    return this.on(event, listener);
  }

  off(event: string, listener: Listener): this {
    this.listeners.get(event)?.delete(listener);
    return this;
  }

  removeListener(event: string, listener: Listener): this {
    return this.off(event, listener);
  }

  emit(event: string, ...args: unknown[]): void {
    for (const listener of [...(this.listeners.get(event) ?? [])]) {
      listener(...args);
    }
  }
}

export interface ShimStdout extends Emitter {
  columns: number;
  rows: number;
  isTTY: boolean;
  writable: boolean;
  destroyed: boolean;
  writableEnded: boolean;
  write(chunk: string | Uint8Array, callback?: () => void): boolean;
  resize(columns: number, rows: number): void;
}

export interface ShimStdin extends Emitter {
  isTTY: boolean;
  push(chunk: string | Uint8Array): void;
  read(): string | Uint8Array | null;
  unshift(chunk: string | Uint8Array): void;
  setEncoding(encoding: string): this;
  setRawMode(enabled: boolean): void;
  ref(): void;
  unref(): void;
  resume(): void;
  pause(): void;
}

/** Writable-shaped stream that forwards every frame to `onOutput`. */
export function createStdout(
  options: {
    columns?: number;
    rows?: number;
    onOutput?: (data: string) => void;
  } = {},
): ShimStdout {
  const decoder = new TextDecoder();
  const emitter = new Emitter();
  const stdout: ShimStdout = Object.assign(emitter, {
    columns: options.columns ?? 80,
    rows: options.rows ?? 24,
    isTTY: true,
    writable: true,
    destroyed: false,
    writableEnded: false,
    write(chunk: string | Uint8Array, callback?: () => void): boolean {
      const text =
        typeof chunk === "string"
          ? chunk
          : decoder.decode(chunk, { stream: true });
      options.onOutput?.(text);
      callback?.();
      return true;
    },
    resize(columns: number, rows: number): void {
      stdout.columns = columns;
      stdout.rows = rows;
      emitter.emit("resize");
    },
  });
  return stdout;
}

/** Readable-shaped stream fed by the browser terminal's input events. */
export function createStdin(): ShimStdin {
  const emitter = new Emitter();
  const chunks: Array<string | Uint8Array> = [];
  let encoding: string | null = null;
  const decoder = new TextDecoder();

  const stdin: ShimStdin = Object.assign(emitter, {
    isTTY: true,
    push(chunk: string | Uint8Array): void {
      chunks.push(chunk);
      emitter.emit("data", chunk);
      emitter.emit("readable");
    },
    read(): string | Uint8Array | null {
      const chunk = chunks.shift();
      if (chunk === undefined) return null;
      if (typeof chunk === "string") return chunk;
      return encoding ? decoder.decode(chunk) : chunk;
    },
    unshift(chunk: string | Uint8Array): void {
      chunks.unshift(chunk);
    },
    setEncoding(next: string): ShimStdin {
      encoding = next;
      return stdin;
    },
    setRawMode(): void {
      /* browser input is always "raw" */
    },
    ref(): void {
      /* no-op */
    },
    unref(): void {
      /* no-op */
    },
    resume(): void {
      /* no-op */
    },
    pause(): void {
      /* no-op */
    },
  });
  return stdin;
}

export interface TerminalStreams {
  stdout: ShimStdout;
  stdin: ShimStdin;
}

/** Creates a matched stdout/stdin pair for the browser terminal backend. */
export function createTerminalStreams(options?: {
  columns?: number;
  rows?: number;
  onOutput?: (data: string) => void;
}): TerminalStreams {
  return { stdout: createStdout(options), stdin: createStdin() };
}
