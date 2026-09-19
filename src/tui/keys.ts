/**
 * Shared menu key predicates (FEAT-134).
 *
 * Terminals make `Enter` and `Esc` easy to hit but hard to discover; the tracker
 * has always had `Z` as a secondary confirm and `X` as a secondary cancel. This
 * module makes that contract uniform across every menu so the two keys cannot
 * drift between overlays. Pass the same `(char, key)` that Ink's `useInput`
 * gives you.
 */
export interface KeyFlags {
  return: boolean;
  escape: boolean;
}

/** Enter, or Z — activates the highlighted row in any menu. */
export function isConfirm(char: string | undefined, key: KeyFlags): boolean {
  return key.return || char === "z" || char === "Z";
}

/** Esc, or X — closes / cancels in any menu. */
export function isCancel(char: string | undefined, key: KeyFlags): boolean {
  return key.escape || char === "x" || char === "X";
}
