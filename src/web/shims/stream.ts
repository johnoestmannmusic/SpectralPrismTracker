/**
 * Browser stand-in for `node:stream` (FEAT-175).
 *
 * Ink's `render` uses `instanceof Stream` to tell a bare stream argument from
 * an options object, and `patch-console` imports `Stream` for its own checks.
 * The `Terminal` shims used to talk to xterm extend this class so both paths
 * behave.
 */

import { EventEmitter } from "./events";

export class Stream extends EventEmitter {
  writable = true;
  readable = false;
  destroyed = false;
  isTTY = false;

  write(_chunk: unknown, callback?: () => void): boolean {
    callback?.();
    return true;
  }

  end(callback?: () => void): this {
    callback?.();
    return this;
  }

  pipe(destination: unknown): unknown {
    return destination;
  }

  read(): null {
    return null;
  }

  push(_chunk: unknown): boolean {
    return true;
  }

  unshift(_chunk: unknown): void {}

  setEncoding(_encoding: string): this {
    return this;
  }

  setRawMode(): this {
    return this;
  }

  resume(): this {
    return this;
  }

  pause(): this {
    return this;
  }

  ref(): this {
    return this;
  }

  unref(): this {
    return this;
  }

  destroy(): this {
    this.destroyed = true;
    return this;
  }
}

export class Readable extends Stream {
  readable = true;
  writable = false;

  static from(_iterable: unknown): Readable {
    return new Readable();
  }
}

export class Writable extends Stream {
  writable = true;
  readable = false;
}

export class Duplex extends Stream {
  readable = true;
  writable = true;
}

export class Transform extends Duplex {}

export class PassThrough extends Transform {}

/** Returns the resolved value of a stream, or invokes `callback`. */
export function finished(
  _stream: unknown,
  callback?: () => void,
): Promise<void> {
  callback?.();
  return Promise.resolve();
}

/** Minimal `pipeline` that simply resolves (browser shims are in-memory). */
export function pipeline(...args: unknown[]): Promise<void> {
  const callback = args.at(-1);
  if (typeof callback === "function") (callback as () => void)();
  return Promise.resolve();
}

export default Stream;
