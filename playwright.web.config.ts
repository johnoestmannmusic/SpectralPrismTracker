import { defineConfig } from "@playwright/test";

/** Web E2E against the built static TUI in `dist/web` (FEAT-108). */
export default defineConfig({
  testDir: "./tests/web",
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:8123",
    channel: "chrome",
    launchOptions: {
      args: [
        // Headless Chrome otherwise blocks the Web Audio context.
        "--autoplay-policy=no-user-gesture-required",
        "--mute-audio",
      ],
    },
  },
  webServer: {
    command: "node dist/web-host/server.mjs",
    url: "http://127.0.0.1:8123",
    reuseExistingServer: true,
    timeout: 60_000,
    // Isolate user state so the host never tries to open the developer's real
    // (large) last project, which would delay startup past the timeout.
    env: {
      SPT_CONFIG: "/tmp/spt-web-e2e/config.json",
      SPT_CONTROL: "0",
    },
  },
});
