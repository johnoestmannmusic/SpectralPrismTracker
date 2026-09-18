import type { Host } from "./types";

let active: Host | null = null;

/** Installs the platform host. Called once by each entrypoint before Session. */
export function setHost(host: Host): void {
  active = host;
}

/** Returns the installed host, throwing when an entrypoint forgot to set one. */
export function getHost(): Host {
  if (!active) {
    throw new Error(
      "No Host installed. Call setHost() (or pass one to new Session()) first.",
    );
  }
  return active;
}

/** Returns the installed host or null (used by lazy helpers that may run early). */
export function activeHost(): Host | null {
  return active;
}

export * from "./types";
