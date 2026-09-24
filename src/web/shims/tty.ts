/**
 * Browser stand-in for `node:tty` (FEAT-175).
 *
 * `chalk` imports `node:tty` for colour-support detection and `terminal-size`
 * checks whether a descriptor is a TTY. The browser is never a TTY, so these
 * report `false` and the defaults take over.
 */

import { Readable, Writable } from "./stream";

export function isatty(): boolean {
  return false;
}

export class ReadStream extends Readable {}

export class WriteStream extends Writable {}

export default { isatty, ReadStream, WriteStream };
