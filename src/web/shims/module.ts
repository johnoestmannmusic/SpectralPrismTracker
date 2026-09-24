/**
 * Browser stand-in for `node:module` (FEAT-175).
 *
 * `stack-utils` imports `createRequire` for source-map lookups; the browser
 * bundle never uses it. Loading must succeed and use must fail loudly.
 */

export function createRequire(): never {
  throw new Error("module.createRequire is not available in the browser");
}

export default { createRequire };
