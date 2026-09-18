// Global order-loop maths for independent per-channel cycling (Cycles Mode).
//
// Each channel can have its own order length, so the song only returns to its
// exact starting state after the least common multiple of those lengths. Kept
// free of any model imports so `songModel`, `timing`, `sampler` and `midi` can
// all share it without creating an import cycle.

/** Safety cap so pathological per-channel lengths cannot build a huge clock. */
export const MAX_LOOP_ORDERS = 4096;
/** Safety cap for total rows in a song loop (variable pattern lengths). */
export const MAX_LOOP_ROWS = 65536;

function gcd(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y !== 0) {
    const next = x % y;
    x = y;
    y = next;
  }
  return x;
}

/** Least common multiple of two positive integers (0 when either is 0). */
export function lcm(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return Math.abs(a / gcd(a, b)) * b;
}

/**
 * Least common multiple of a list of positive integers, capped at `cap`.
 * Returns `fallback` when no usable values are supplied.
 */
export function lcmOf(
  values: number[],
  fallback = 1,
  cap = MAX_LOOP_ORDERS,
): number {
  const positive = values
    .filter((value) => Number.isFinite(value) && value > 0)
    .map((value) => Math.floor(value));
  if (positive.length === 0) return Math.max(Math.floor(fallback), 1);
  let result = 1;
  for (const value of positive) {
    result = lcm(result, value);
    if (result >= cap) return cap;
  }
  return Math.max(result, 1);
}

/**
 * Number of global orders before every channel wraps back to its start: the
 * LCM of the (positive) channel lengths, capped at {@link MAX_LOOP_ORDERS}.
 * Returns `fallback` when no usable lengths are supplied.
 */
export function loopOrderCount(lengths: number[], fallback = 1): number {
  return lcmOf(lengths, fallback, MAX_LOOP_ORDERS);
}
