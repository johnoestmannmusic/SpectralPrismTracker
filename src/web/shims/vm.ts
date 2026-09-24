/**
 * Browser stand-in for `node:vm` (FEAT-175).
 *
 * `es-toolkit` imports `node:vm` for its server-only helpers, which are
 * tree-shaken out of the browser bundle. The module still has to load.
 */

export function createContext(sandbox: object = {}): object {
  return sandbox;
}

export function isContext(): boolean {
  return false;
}

export function runInContext(): never {
  throw new Error("vm.runInContext is not available in the browser");
}

export function runInNewContext(): never {
  throw new Error("vm.runInNewContext is not available in the browser");
}

export function runInThisContext(): never {
  throw new Error("vm.runInThisContext is not available in the browser");
}

export class Script {
  constructor(public code: string) {}

  runInContext(): never {
    throw new Error("vm.Script is not available in the browser");
  }
}

export default {
  createContext,
  isContext,
  runInContext,
  runInNewContext,
  runInThisContext,
  Script,
};
