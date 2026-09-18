import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Session } from "@/tui/session";
import { importSample } from "@/tui/io";

describe("importSample (FEAT-99)", () => {
  let dir: string;
  const session = new Session();

  beforeAll(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "lantern-import-"));
    await session.init();
  }, 60_000);

  afterAll(async () => {
    session.dispose();
    await rm(dir, { recursive: true, force: true });
  });

  it("embeds the bytes as a data URL and names the slot", async () => {
    const file = path.join(dir, "kick.wav");
    await writeFile(file, new Uint8Array([82, 73, 70, 70, 0, 0, 0, 0]));
    const result = await importSample(session, 3, file);
    expect(result.ok).toBe(true);
    expect(session.sampleName(3)).toBe("kick");
    const ref = session.getState().project?.sourceSamples[3];
    expect(ref?.dataUrl).toMatch(/^data:audio\/wav;base64,/);
  });

  it("rejects unsupported extensions", async () => {
    const file = path.join(dir, "notes.txt");
    await writeFile(file, "hello", "utf8");
    const result = await importSample(session, 2, file);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("Unsupported audio");
  });

  it("rejects an out-of-range slot", async () => {
    const file = path.join(dir, "kick.wav");
    await writeFile(file, new Uint8Array([1, 2, 3]));
    const result = await importSample(session, 9, file);
    expect(result.ok).toBe(false);
  });
});
