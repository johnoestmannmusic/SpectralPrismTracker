import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  configDir,
  configPath,
  readConfig,
  recordLastProject,
  writeConfig,
} from "@/runtime/config";
import { backupPath, restoreBackup, saveBackup } from "@/tui/autosave";
import { AUTOSAVE_EVERY, Session } from "@/tui/session";
import { resolveStartupProject } from "@/tui/startup";

describe("runtime config", () => {
  let dir: string;
  let env: NodeJS.ProcessEnv;

  beforeAll(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "lantern-config-"));
    env = { LANTERN_CONFIG: path.join(dir, "config.json") };
  });

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("resolves the config path from env/XDG", () => {
    expect(configPath({ LANTERN_CONFIG: "/tmp/x/custom.json" })).toBe(
      "/tmp/x/custom.json",
    );
    expect(configDir({ LANTERN_CONFIG: "/tmp/x/custom.json" })).toBe("/tmp/x");
    expect(configDir({ XDG_CONFIG_HOME: "/tmp/xdg" })).toBe("/tmp/xdg/lantern");
  });

  it("round-trips config and records the last project", async () => {
    expect(await readConfig(env)).toEqual({});
    expect(
      await writeConfig(
        { defaultOpen: { mode: "file", path: "/tmp/song.lampjson" } },
        env,
      ),
    ).toBe(true);
    expect(await readConfig(env)).toEqual({
      defaultOpen: { mode: "file", path: "/tmp/song.lampjson" },
    });

    await recordLastProject("relative/song.lampjson", env);
    const config = await readConfig(env);
    expect(config.lastProject).toBe(path.resolve("relative/song.lampjson"));
    // The default-open override is preserved across the merge.
    expect(config.defaultOpen).toEqual({
      mode: "file",
      path: "/tmp/song.lampjson",
    });
  });

  it("ignores malformed config JSON", async () => {
    await writeFile(configPath(env), "{ not json", "utf8");
    expect(await readConfig(env)).toEqual({});
  });
});

describe("startup project resolution", () => {
  it("prefers the explicit file, then off, then last, then bundled", () => {
    expect(resolveStartupProject({})).toBeNull();
    expect(resolveStartupProject({ lastProject: "/a" })).toBe("/a");
    expect(
      resolveStartupProject({
        lastProject: "/a",
        defaultOpen: { mode: "last" },
      }),
    ).toBe("/a");
    expect(
      resolveStartupProject({
        lastProject: "/a",
        defaultOpen: { mode: "off" },
      }),
    ).toBeNull();
    expect(
      resolveStartupProject({
        lastProject: "/a",
        defaultOpen: { mode: "file", path: "/b" },
      }),
    ).toBe("/b");
  });
});

describe("autosave", () => {
  let dir: string;
  let env: NodeJS.ProcessEnv;
  const session = new Session();

  beforeAll(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "lantern-autosave-"));
    env = { LANTERN_CONFIG: path.join(dir, "config.json") };
    await session.init();
  }, 60_000);

  afterAll(async () => {
    session.dispose();
    await rm(dir, { recursive: true, force: true });
  });

  it("fires the hook every AUTOSAVE_EVERY mutating actions", () => {
    let calls = 0;
    session.setAutosaveHook(() => {
      calls += 1;
    });
    for (let i = 0; i < AUTOSAVE_EVERY - 1; i++) session.setMasterVolume(0.5);
    expect(calls).toBe(0);
    session.setMasterVolume(0.5);
    expect(calls).toBe(1);
    for (let i = 0; i < AUTOSAVE_EVERY; i++) session.setMasterVolume(0.5);
    expect(calls).toBe(2);
    session.setAutosaveHook(null);
  });

  it("writes the live project to backup.lmpjson and restores it", async () => {
    session.setMasterVolume(0.42);
    expect(await saveBackup(session, env)).toBe(true);
    expect(backupPath(env)).toBe(path.join(dir, "backup.lmpjson"));

    session.setMasterVolume(1);
    const result = await restoreBackup(session, backupPath(env));
    expect(result.ok).toBe(true);
    expect(session.getState().masterVolume).toBeCloseTo(0.42);
  });

  it("reports a clear error when the backup is missing", async () => {
    const result = await restoreBackup(session, path.join(dir, "nope.lmpjson"));
    expect(result.ok).toBe(false);
    expect(result.error).toContain("Cannot read");
  });
});
