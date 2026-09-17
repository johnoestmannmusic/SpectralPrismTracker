import type { LanternApi } from "../shared/ipc";

declare global {
  interface Window {
    lantern: LanternApi;
  }
}

export {};
