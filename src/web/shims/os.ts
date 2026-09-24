/**
 * Browser stand-in for `node:os` (FEAT-175).
 *
 * `chalk` and `ansi-escapes` query platform details at import time; returning
 * conservative browser values keeps them from crashing.
 */

export const EOL = "\n";
export const devNull = "/dev/null";

export function type(): string {
  return "Browser";
}

export function platform(): string {
  return "browser";
}

export function arch(): string {
  return "wasm32";
}

export function release(): string {
  return "";
}

export function version(): string {
  return "";
}

export function hostname(): string {
  return "localhost";
}

export function homedir(): string {
  return "/";
}

export function tmpdir(): string {
  return "/tmp";
}

export function cpus(): unknown[] {
  return [];
}

export function totalmem(): number {
  return 0;
}

export function freemem(): number {
  return 0;
}

export function endianness(): string {
  return "LE";
}

export function userInfo() {
  return { username: "web", homedir: "/", shell: null };
}

export default {
  EOL,
  devNull,
  type,
  platform,
  arch,
  release,
  version,
  hostname,
  homedir,
  tmpdir,
  cpus,
  totalmem,
  freemem,
  endianness,
  userInfo,
};
