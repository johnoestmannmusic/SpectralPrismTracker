export interface FuzzyMatch {
  score: number;
  /** Indices in the target that matched, in order. */
  matched: number[];
}

/**
 * Case-insensitive subsequence scorer. Rewards consecutive matches, matches at
 * word boundaries and an exact prefix, so "sng" prefers "song" over "sampling".
 * Deterministic: equal scores are broken by the caller on command name.
 */
export function fuzzyScore(query: string, target: string): FuzzyMatch | null {
  const needle = query.toLowerCase();
  const haystack = target.toLowerCase();
  if (needle.length === 0) return { score: 0, matched: [] };
  if (needle.length > haystack.length) return null;

  const matched: number[] = [];
  let score = 0;
  let targetIndex = 0;
  let previousMatch = -2;

  for (const char of needle) {
    let found = -1;
    for (let i = targetIndex; i < haystack.length; i++) {
      if (haystack[i] === char) {
        found = i;
        break;
      }
    }
    if (found === -1) return null;

    let charScore = 1;
    if (found === 0) charScore += 6;
    else if (!/[a-z0-9]/.test(haystack[found - 1]!)) charScore += 4;
    if (found === previousMatch + 1) charScore += 5;
    if (found === targetIndex && targetIndex === previousMatch + 1)
      charScore += 2;

    score += charScore;
    matched.push(found);
    previousMatch = found;
    targetIndex = found + 1;
  }

  // Prefer shorter targets and full-length matches.
  score += Math.max(0, 8 - haystack.length) * 0.25;
  if (
    matched[0] === 0 &&
    matched.length === needle.length &&
    matched[matched.length - 1] === matched.length - 1
  ) {
    score += 3;
  }
  return { score, matched };
}

export interface Ranked<T> {
  item: T;
  score: number;
  matched: number[];
}

/** Ranks items by fuzzy score against `query`, dropping non-matches. */
export function rank<T>(
  query: string,
  items: T[],
  key: (item: T) => string,
): Array<Ranked<T>> {
  const results: Array<Ranked<T>> = [];
  for (const item of items) {
    const match = fuzzyScore(query, key(item));
    if (!match) continue;
    results.push({ item, score: match.score, matched: match.matched });
  }
  results.sort(
    (a, b) => b.score - a.score || key(a.item).localeCompare(key(b.item)),
  );
  return results;
}
