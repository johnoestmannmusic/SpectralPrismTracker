import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
  listSourceSamples,
  loadDefaultSong,
  readAsset,
  resolveAssetsDir,
} from "@/runtime/assets";
import {
  ensureExtension,
  extensionOf,
  readBytesSafe,
  writeBytesSafe,
} from "@/runtime/files";

describe("runtime assets", () => {
  it("resolves the bundled assets directory from the working directory", () => {
    const dir = resolveAssetsDir();
    expect(path.basename(dir)).toBe("assets");
  });

  it("loads the bundled project with source samples", async () => {
    const result = await loadDefaultSong();
    expect("error" in result).toBe(false);
    if ("error" in result) return;

    expect(result.project.length).toBeGreaterThan(0);
    expect(() => JSON.parse(result.project)).not.toThrow();

    // All six source samples are bundled.
    expect(result.raw).toBeUndefined();
    expect(result.samples).toHaveLength(6);
    expect(result.samples.every((sample) => sample instanceof Uint8Array)).toBe(
      true,
    );
  });

  it("lists source samples with presence flags", async () => {
    const samples = await listSourceSamples();
    expect(samples.map((sample) => sample.index)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(samples.every((sample) => sample.present)).toBe(true);
    expect(samples.every((sample) => (sample.bytes?.length ?? 0) > 0)).toBe(
      true,
    );
  });

  it("reads a bundled asset relative to the root", async () => {
    const bytes = await readAsset("SourceSamples/0.ogg");
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes!.length).toBeGreaterThan(0);
    expect(await readAsset("SourceSamples/does-not-exist.ogg")).toBeNull();
  });

  it("reports a clear error for a missing root", async () => {
    const result = await loadDefaultSong({ root: "/definitely/not/here" });
    expect(result).toEqual(
      expect.objectContaining({
        error: expect.stringContaining("Cannot find the bundled project"),
      }),
    );
  });
});

describe("runtime files", () => {
  const created: string[] = [];

  afterAll(async () => {
    await Promise.all(
      created.map((dir) => rm(dir, { recursive: true, force: true })),
    );
  });

  it("normalises extensions", () => {
    expect(extensionOf("Song.FUR")).toBe("fur");
    expect(ensureExtension("song", "wav")).toBe("song.wav");
    expect(ensureExtension("song.wav", "wav")).toBe("song.wav");
    expect(ensureExtension("song", ".mid")).toBe("song.mid");
  });

  it("round-trips bytes and refuses to clobber when asked", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "lantern-runtime-"));
    created.push(dir);
    const file = path.join(dir, "nested", "out.bin");
    const bytes = new Uint8Array([1, 2, 3, 4]);

    const written = await writeBytesSafe(file, bytes);
    expect(written.ok).toBe(true);

    const read = await readBytesSafe(file);
    expect(read.ok).toBe(true);
    if (read.ok) expect(Array.from(read.value)).toEqual([1, 2, 3, 4]);

    const blocked = await writeBytesSafe(file, bytes, { overwrite: false });
    expect(blocked).toEqual(expect.objectContaining({ ok: false }));

    const missing = await readBytesSafe(path.join(dir, "absent.bin"));
    expect(missing.ok).toBe(false);
  });
});
