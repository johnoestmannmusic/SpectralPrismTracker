import { afterEach, describe, expect, it, vi } from "vitest";
import { configDir } from "@/runtime/config";

/** FEAT-111: user-state paths must follow the host OS conventions. */
describe("cross-platform config paths", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses XDG_CONFIG_HOME when set (POSIX)", () => {
    vi.spyOn(process, "platform", "get").mockReturnValue("linux");
    expect(configDir({ XDG_CONFIG_HOME: "/tmp/xdg" })).toBe(
      "/tmp/xdg/spectralprism",
    );
  });

  it("uses %APPDATA% on Windows instead of ~/.config", () => {
    vi.spyOn(process, "platform", "get").mockReturnValue("win32");
    const resolved = configDir({ APPDATA: "C:\\Users\\me\\AppData\\Roaming" });
    expect(resolved).toContain("C:\\Users\\me\\AppData\\Roaming");
    expect(resolved).not.toContain(".config");
  });

  it("honours an explicit SPT_CONFIG path on every platform", () => {
    vi.spyOn(process, "platform", "get").mockReturnValue("win32");
    expect(configDir({ SPT_CONFIG: "/tmp/custom.json" })).toBe("/tmp");
  });

  it("still honours the legacy LANTERN_CONFIG path", () => {
    vi.spyOn(process, "platform", "get").mockReturnValue("win32");
    expect(configDir({ LANTERN_CONFIG: "/tmp/custom.json" })).toBe("/tmp");
  });
});
