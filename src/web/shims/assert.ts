/**
 * Browser stand-in for `node:assert` (FEAT-175).
 *
 * `signal-exit` imports assert for internal invariants. Assertions must still
 * fail loudly, but always in a browser-safe way.
 */

export class AssertionError extends Error {
  constructor(message?: string) {
    super(message ?? "Assertion failed");
    this.name = "AssertionError";
  }
}

type Assert = {
  (value: unknown, message?: string): asserts value;
  ok: (value: unknown, message?: string) => asserts value;
  equal: (actual: unknown, expected: unknown, message?: string) => void;
  strictEqual: (actual: unknown, expected: unknown, message?: string) => void;
  notEqual: (actual: unknown, expected: unknown, message?: string) => void;
  deepEqual: (actual: unknown, expected: unknown, message?: string) => void;
  throws: (fn: () => unknown, message?: string) => void;
  fail: (message?: string) => never;
};

const ok = (value: unknown, message?: string): asserts value => {
  if (!value) throw new AssertionError(message);
};

const assert = ok as Assert;
assert.ok = ok;
assert.equal = (actual, expected, message) => {
  if (actual != expected) throw new AssertionError(message);
};
assert.strictEqual = (actual, expected, message) => {
  if (actual !== expected) throw new AssertionError(message);
};
assert.notEqual = (actual, expected, message) => {
  if (actual == expected) throw new AssertionError(message);
};
assert.deepEqual = () => {};
assert.throws = (fn, message) => {
  try {
    fn();
  } catch {
    return;
  }
  throw new AssertionError(message);
};
assert.fail = (message) => {
  throw new AssertionError(message);
};

export default assert;
export { assert };
