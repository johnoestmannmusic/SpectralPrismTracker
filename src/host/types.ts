import type { LoadedSong } from "@/shared/types";

/** Same shape as the Node runtime's Result, kept host-neutral. */
export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

/** How the app chooses the project to open at startup. */
export type DefaultOpen =
  { mode: "last" } | { mode: "off" } | { mode: "file"; path: string };

/** User config persisted by the host (file in Node, IndexedDB in the browser). */
export interface LanternConfig {
  /** Path of the most recently opened/saved project. */
  lastProject?: string | null;
  /** Startup file policy. Missing means "last". */
  defaultOpen?: DefaultOpen;
  /** Most-recently used project paths, newest first (max 10). */
  recentProjects?: string[];
  /** Workspace preference: true polymeter Cycles view. */
  cyclesMode?: boolean;
}

export interface SourceSampleAsset {
  index: number;
  path: string;
  present: boolean;
  bytes: Uint8Array | null;
}

/** Writable options shared by host filesystems. */
export interface WriteOptions {
  /** Overwrite an existing file. Defaults to true. */
  overwrite?: boolean;
  /** Create missing parent directories. Defaults to true. */
  createDirs?: boolean;
}

/** File system + path completion surface used by the TUI IO layer. */
export interface HostFs {
  readTextSafe(path: string): Promise<Result<string>>;
  readBytesSafe(path: string): Promise<Result<Uint8Array>>;
  writeBytesSafe(
    path: string,
    bytes: Uint8Array,
    options?: WriteOptions,
  ): Promise<Result<string>>;
  fileExists(path: string): Promise<boolean>;
  /** Resolves a possibly-relative path to an absolute form where meaningful. */
  resolvePath(path: string): string;
  /**
   * Directory/file completion for path arguments. Node reads the real
   * filesystem; the browser returns [] because it cannot browse paths.
   */
  completePath(prefix: string): Promise<string[]>;
}

/** Bundled-asset loading surface. */
export interface HostAssets {
  listSourceSamples(): Promise<SourceSampleAsset[]>;
  loadDefaultSong(): Promise<LoadedSong | { error: string }>;
}

/** Persistent user-state surface (recent projects, startup policy, backup). */
export interface HostConfig {
  read(): Promise<LanternConfig>;
  write(patch: LanternConfig): Promise<boolean>;
  recordLastProject(path: string): Promise<void>;
  /** Path/identifier of the rolling autosave backup. */
  backupPath(): string;
}

/** Audio bootstrap surface. */
export interface HostAudio {
  /** Installs the Web Audio globals where the host does not provide them. */
  installGlobals(): void;
  /** True once realtime/offline context constructors are usable. */
  globalsAvailable(): boolean;
}

/**
 * The platform contract. The desktop (Node) and web (browser) builds each
 * provide one implementation so `src/tui` never imports `node:` directly.
 */
export interface Host {
  kind: "node" | "browser";
  fs: HostFs;
  assets: HostAssets;
  config: HostConfig;
  audio: HostAudio;
}
