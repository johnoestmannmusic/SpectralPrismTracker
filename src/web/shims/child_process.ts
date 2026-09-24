/**
 * Browser stand-in for `node:child_process` (FEAT-175).
 *
 * `terminal-size` imports this for its Windows probe, which cannot run in a
 * browser. Loading must succeed; invoking must fail loudly.
 */

function unavailable(operation: string): never {
  throw new Error(`child_process.${operation} is not available in the browser`);
}

export function exec(): never {
  return unavailable("exec");
}

export function execSync(): never {
  return unavailable("execSync");
}

export function execFile(): never {
  return unavailable("execFile");
}

export function execFileSync(): never {
  return unavailable("execFileSync");
}

export function spawn(): never {
  return unavailable("spawn");
}

export function spawnSync(): never {
  return unavailable("spawnSync");
}

export function fork(): never {
  return unavailable("fork");
}

export default {
  exec,
  execSync,
  execFile,
  execFileSync,
  spawn,
  spawnSync,
  fork,
};
