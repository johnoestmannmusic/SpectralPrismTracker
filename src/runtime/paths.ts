/**
 * Platform-neutral path helpers.
 *
 * These deliberately avoid `node:path` so the same code runs in the browser
 * bundle. They handle both POSIX (`/`) and Windows (`\`) separators.
 */

/** Last path segment (no separator). */
export function basename(filePath: string): string {
  const index = Math.max(filePath.lastIndexOf("/"), filePath.lastIndexOf("\\"));
  return index >= 0 ? filePath.slice(index + 1) : filePath;
}

/** Everything before the last separator ("" when there is none). */
export function dirname(filePath: string): string {
  const index = Math.max(filePath.lastIndexOf("/"), filePath.lastIndexOf("\\"));
  return index >= 0 ? filePath.slice(0, index) : "";
}

/** Extension including the dot ("" when there is none). */
export function extname(filePath: string): string {
  const base = basename(filePath);
  const index = base.lastIndexOf(".");
  return index > 0 ? base.slice(index) : "";
}

/** Canonical project extension (FEAT-150). */
export const PROJECT_EXTENSION = "sptproj";
/** Extensions we still open for back-compat; `.lmpjson` was never released. */
export const LEGACY_PROJECT_EXTENSIONS = ["lampjson", "lmpjson"];

/** True when a path looks like a SpectralPrism project (current or legacy). */
export function isProjectPath(filePath: string): boolean {
  const ext = extensionOf(filePath);
  return ext === PROJECT_EXTENSION || LEGACY_PROJECT_EXTENSIONS.includes(ext);
}

export interface SaveFilter {
  name: string;
  extensions: string[];
}

/** Extension -> dialog/save filter. Shared by every host shell. */
export const SAVE_FILTERS: Record<string, SaveFilter> = {
  sptproj: { name: "SpectralPrism Project", extensions: ["sptproj"] },
  lampjson: {
    name: "SpectralPrism Project (legacy)",
    extensions: ["lampjson"],
  },
  wav: { name: "WAV audio", extensions: ["wav"] },
  mid: { name: "MIDI", extensions: ["mid"] },
  zip: { name: "ZIP archive", extensions: ["zip"] },
  png: { name: "PNG image", extensions: ["png"] },
};

/** `song.sptproj` -> `song`. */
export function basenameNoExt(filePath: string): string {
  return basename(filePath).replace(/\.[^.]+$/, "");
}

/** `song.sptproj` -> `sptproj` (lower-case, no dot). Returns "" when there is none. */
export function extensionOf(filePath: string): string {
  return extname(filePath).replace(".", "").toLowerCase();
}

/** Appends `extension` (e.g. "wav") when `name` has no extension. */
export function ensureExtension(name: string, extension: string): string {
  const clean = extension.replace(/^\./, "");
  return extname(name) ? name : `${name}.${clean}`;
}

export function saveFilterFor(filePath: string): SaveFilter | undefined {
  return SAVE_FILTERS[extensionOf(filePath)];
}

/**
 * The same path with the other project extension (FEAT-150). Used to auto-open
 * a file the user renamed after the `.lampjson` → `.sptproj` migration.
 * Returns null when the path is not a project file.
 */
export function alternateProjectPath(filePath: string): string | null {
  const ext = extname(filePath);
  const lower = ext.toLowerCase();
  if (lower === ".lampjson" || lower === ".lmpjson") {
    return `${filePath.slice(0, filePath.length - ext.length)}.sptproj`;
  }
  if (lower === ".sptproj") {
    return `${filePath.slice(0, filePath.length - ext.length)}.lampjson`;
  }
  return null;
}
