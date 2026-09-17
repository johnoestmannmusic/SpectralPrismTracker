import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { createRegistry } from "@/tui/commands";
import { fuzzyScore, rank } from "@/tui/commands/fuzzy";
import { tokenize } from "@/tui/commands/registry";
import type { CommandContext } from "@/tui/commands/types";
import { Session } from "@/tui/session";
import { listSourceSamples } from "@/runtime/assets";
import { basenameNoExt } from "@/runtime/files";

const registry = createRegistry();

async function run(session: Session, line: string) {
  const ctx: CommandContext = {
    session,
    listCommands: () => registry.all(),
  };
  return registry.execute(line, ctx);
}

describe("fuzzy command matching", () => {
  it("matches subsequences and scores prefixes highest", () => {
    expect(fuzzyScore("xyz", "song")).toBeNull();
    const prefix = fuzzyScore("pl", "play");
    const scattered = fuzzyScore("pl", "playlist");
    expect(prefix).not.toBeNull();
    expect(scattered).not.toBeNull();
    expect(prefix!.score).toBeGreaterThan(scattered!.score);
  });

  it("ranks the intended command first", () => {
    const commands = registry.all();
    const top = rank("stop", commands, (command) => command.name)[0];
    expect(top?.item.name).toBe("stop");
  });

  it("tokenizes quoted arguments", () => {
    expect(tokenize('save "my file.lampjson" --force')).toEqual([
      "save",
      "my file.lampjson",
      "--force",
    ]);
  });
});

describe("command registry", () => {
  it("parses positional args and flags", () => {
    const def = registry.get("seek")!;
    const parsed = registry.parse(def, ["1:30"]);
    expect(parsed.values["time"]).toBe("1:30");
  });

  it("suggests a correction for a typo", async () => {
    const session = new Session();
    const result = await run(session, "pla");
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/did you mean/i);
  });

  it("completes enum choices", async () => {
    const def = registry.get("follow")!;
    const choices = await registry.completeArg(def, 0, "", {
      session: new Session(),
    });
    expect(choices).toEqual(["on", "off", "toggle"]);
  });

  it("autocompletes an unfinished command on Enter", () => {
    expect(registry.enterAction("/inf", true)).toBe("complete");
    expect(registry.enterAction("/", true)).toBe("complete");
    expect(registry.enterAction("/info", true)).toBe("run");
    expect(registry.enterAction("/info song", true)).toBe("run");
    expect(registry.enterAction("/nonsense", false)).toBe("run");
  });
});

describe("session commands over the bundled song", () => {
  const session = new Session();

  beforeAll(async () => {
    await session.init();
  }, 60_000);

  afterAll(() => {
    session.dispose();
  });

  it("loads the bundled project", () => {
    const state = session.getState();
    expect(state.error).toBeNull();
    expect(state.song?.meta.name).toBeTruthy();
    expect(state.song?.instruments.length).toBeGreaterThan(0);
  });

  it("/info reports song metadata", async () => {
    const result = await run(session, "info");
    expect(result.ok).toBe(true);
    expect(result.data).toMatchObject({
      name: session.getState().song?.meta.name,
      instruments: session.getState().song?.instruments.length,
    });
  });

  it("/goto and cursor movement update the view", async () => {
    expect((await run(session, "goto 2 8")).ok).toBe(true);
    expect(session.getState().viewOrder).toBe(2);
    expect(session.getState().cursor.row).toBe(8);
  });

  it("/note writes a cell that /undo reverts", async () => {
    session.setCursor({ order: 0, channel: 0, row: 0, column: 0 });
    const result = await run(session, "note C-4");
    expect(result.ok).toBe(true);
    expect(session.getState().dirty).toBe(true);

    const undo = await run(session, "undo");
    expect(undo.ok).toBe(true);
  });

  it("/channel and /octave clamp their inputs", async () => {
    await run(session, "channel 3");
    expect(session.getState().cursor.channel).toBe(3);
    await run(session, "octave 12");
    expect(session.lastOctaveValue).toBe(8);
  });

  it("/mute and /volume update the mixer state", async () => {
    await run(session, "mute 1");
    expect(session.getState().channelMuted[1]).toBe(true);
    await run(session, "volume 1 0.5");
    expect(session.getState().channelVolume[1]).toBeCloseTo(0.5);
    await run(session, "unmute 1");
    expect(session.getState().channelMuted[1]).toBe(false);
  });

  it("/sourcesamples lists the bundled source samples with a one-line status", async () => {
    const result = await run(session, "sourcesamples");
    expect(result.ok).toBe(true);
    const data = result.data as { samples: unknown[] };
    expect(data.samples).toHaveLength(6);
    // A multi-line status would grow the StatusBar and break Ink repainting.
    expect(result.message ?? "").not.toContain("\n");
  });

  it("plays through the Node audio backend and advances the clock", async () => {
    const engine = session.backend!;
    const deadline = Date.now() + 20_000;
    while (!engine.samplerReady() && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    expect(engine.samplerReady()).toBe(true);

    await run(session, "play");
    await new Promise((resolve) => setTimeout(resolve, 700));
    session.refreshPlayhead();

    expect(session.getState().playing).toBe(true);
    expect(session.getState().time).toBeGreaterThan(0);
    await run(session, "stop");
  }, 30_000);

  it("/save writes a .lampjson file", async () => {
    const { mkdtemp, readFile, rm } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const path = await import("node:path");
    const dir = await mkdtemp(path.join(tmpdir(), "lantern-save-"));
    try {
      const target = path.join(dir, "out.lampjson");
      const result = await run(session, `save "${target}"`);
      expect(result.ok).toBe(true);
      const text = await readFile(target, "utf8");
      expect(text).toContain("version");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("/instruments reports the instrument count", async () => {
    const result = await run(session, "instruments");
    expect(result.ok).toBe(true);
    const data = result.data as { instruments: number };
    expect(data.instruments).toBeGreaterThan(0);
  });

  it("/new names source samples from their filenames", async () => {
    const result = await run(session, "new");
    expect(result.ok).toBe(true);
    const assets = await listSourceSamples();
    const expected = assets.map((asset) => basenameNoExt(asset.path));
    expect(expected.every((name) => name.length > 0)).toBe(true);
    expect(session.getState().sampleNames.slice(0, 6)).toEqual(expected);
  });
});
