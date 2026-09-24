/**
 * Browser stand-in for `node:process` (FEAT-175).
 *
 * Ink and several dependencies (`chalk`, `ansi-escapes`, `is-in-ci`,
 * `cli-cursor`, `signal-exit`) import `process` at module load. Rather than
 * bundle a general-purpose polyfill, this provides only the surface those
 * modules touch, with stdout/stderr routed to the local terminal via the shim
 * sink.
 */

import { EventEmitter } from "./events";
import { writeShim } from "./sink";

const emitter = new EventEmitter();

function makeOutput(): Record<string, unknown> {
  return {
    isTTY: false,
    columns: undefined,
    rows: undefined,
    write: (chunk: unknown): boolean => writeShim(chunk),
    end: (): void => {},
    cork: (): void => {},
    uncork: (): void => {},
    on: emitter.on.bind(emitter),
    off: emitter.off.bind(emitter),
    once: emitter.once.bind(emitter),
    addListener: emitter.on.bind(emitter),
    removeListener: emitter.off.bind(emitter),
    emit: emitter.emit.bind(emitter),
  };
}

const stdoutStream = makeOutput();
const stderrStream = makeOutput();
const stdinStream = { ...makeOutput(), read: (): null => null };

const processShim = {
  env: {} as Record<string, string | undefined>,
  argv: [] as string[],
  argv0: "spt",
  execPath: "spt",
  browser: true,
  platform: "browser",
  arch: "wasm32",
  pid: 1,
  title: "spt",
  version: "",
  versions: { node: "" },
  cwd: (): string => "/",
  chdir: (): void => {},
  exit: (): void => {},
  abort: (): void => {},
  nextTick: (callback: (...args: unknown[]) => void, ...args: unknown[]) => {
    queueMicrotask(() => callback(...args));
  },
  hrtime: Object.assign((): [number, number] => [0, 0], {
    bigint: (): bigint => 0n,
  }),
  uptime: (): number => 0,
  memoryUsage: () => ({ heapUsed: 0, rss: 0 }),
  on: emitter.on.bind(emitter),
  off: emitter.off.bind(emitter),
  once: emitter.once.bind(emitter),
  addListener: emitter.on.bind(emitter),
  removeListener: emitter.off.bind(emitter),
  removeAllListeners: emitter.removeAllListeners.bind(emitter),
  emit: emitter.emit.bind(emitter),
  stdout: stdoutStream,
  stderr: stderrStream,
  stdin: stdinStream,
};

export default processShim;
export const env = processShim.env;
export const argv = processShim.argv;
export const argv0 = processShim.argv0;
export const platform = processShim.platform;
export const arch = processShim.arch;
export const pid = processShim.pid;
export const title = processShim.title;
export const version = processShim.version;
export const versions = processShim.versions;
export const cwd = processShim.cwd;
export const chdir = processShim.chdir;
export const exit = processShim.exit;
export const abort = processShim.abort;
export const nextTick = processShim.nextTick;
export const hrtime = processShim.hrtime;
export const uptime = processShim.uptime;
export const memoryUsage = processShim.memoryUsage;
export const on = processShim.on;
export const off = processShim.off;
export const once = processShim.once;
export const addListener = processShim.addListener;
export const removeListener = processShim.removeListener;
export const removeAllListeners = processShim.removeAllListeners;
export const emit = processShim.emit;
export const stdout = processShim.stdout;
export const stderr = processShim.stderr;
export const stdin = processShim.stdin;
