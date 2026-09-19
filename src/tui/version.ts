/** Build-injected date stamp (YYYYMMDD) and the app display name (FEAT-152/153). */
export const APP_NAME = "SpectralPrism Tracker";

/**
 * `__BUILD_DATE__` is replaced at build time by esbuild/Vite (and by the Vitest
 * config); guard with `typeof` so running the un-bundled source cannot throw.
 */
export const BUILD_DATE: string =
  typeof __BUILD_DATE__ === "string" ? __BUILD_DATE__ : "";

/** e.g. `SPECTRALPRISM TRACKER v20250919` (falls back to no version in dev). */
export function versionStamp(): string {
  return BUILD_DATE
    ? `${APP_NAME.toUpperCase()} v${BUILD_DATE}`
    : APP_NAME.toUpperCase();
}
