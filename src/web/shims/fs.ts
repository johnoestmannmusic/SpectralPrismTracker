/**
 * Browser stand-in for `node:fs` (FEAT-175).
 *
 * Ink reads source files for `ErrorOverview` and dynamically imports `node:fs`
 * for the devtools hook; `terminal-size` probes the filesystem as a fallback.
 * None of these paths run in the browser, but the module must load and any
 * actual use must fail loudly rather than silently returning bad data.
 */

function unavailable(operation: string): never {
  const error = new Error(`fs.${operation} is not available in the browser`);
  (error as { code?: string }).code = "ENOSYS";
  throw error;
}

export function readFileSync(): never {
  return unavailable("readFileSync");
}

export function writeFileSync(): never {
  return unavailable("writeFileSync");
}

export function existsSync(): boolean {
  return false;
}

export function statSync(): never {
  return unavailable("statSync");
}

export function lstatSync(): never {
  return unavailable("lstatSync");
}

export function readdirSync(): string[] {
  return [];
}

export function realpathSync(path: string): string {
  return path;
}

export function openSync(): never {
  return unavailable("openSync");
}

export function closeSync(): void {}

export function mkdirSync(): void {}

export const constants = {};

export const promises = {
  readFile: async (): Promise<never> => unavailable("promises.readFile"),
  writeFile: async (): Promise<never> => unavailable("promises.writeFile"),
  stat: async (): Promise<never> => unavailable("promises.stat"),
  readdir: async (): Promise<string[]> => [],
  mkdir: async (): Promise<void> => {},
  realpath: async (path: string): Promise<string> => path,
};

export default {
  readFileSync,
  writeFileSync,
  existsSync,
  statSync,
  lstatSync,
  readdirSync,
  realpathSync,
  openSync,
  closeSync,
  mkdirSync,
  constants,
  promises,
};
