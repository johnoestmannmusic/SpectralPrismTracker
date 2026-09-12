/** Mirrors cover.rs's `safe_filename`: keep [A-Za-z0-9-_], else "-". */
export function safeFilename(value: string): string {
  const mapped = value.replace(/[^A-Za-z0-9-_]/g, "-").replace(/^-+|-+$/g, "");
  return mapped.length > 0 ? mapped : "lantern-export";
}

export function linearToDb(value: number): number {
  return value > 0 ? 20 * Math.log10(value) : -Infinity;
}

export function dbToLinear(db: number): number {
  return db <= -80 ? 0 : Math.pow(10, db / 20);
}

export function formatDb(value: number): string {
  const db = linearToDb(value);
  return Number.isFinite(db) ? db.toFixed(1) : "-∞";
}
