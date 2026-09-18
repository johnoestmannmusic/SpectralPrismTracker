import { afterEach, describe, expect, it, vi } from "vitest";
import { browserAudio } from "@/host/browser/audio";
import { listSourceSamples, loadDefaultSong } from "@/host/browser/assets";
import { browserConfig } from "@/host/browser/config";
import {
  browserFs,
  normalizePath,
  readBytesSafe,
  readTextSafe,
  writeBytesSafe,
} from "@/host/browser/files";

describe("browser host (FEAT-102/103)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("normalises POSIX-ish paths", () => {
    expect(normalizePath("/a/./b/../c")).toBe("/a/c");
    expect(normalizePath("a\\b")).toBe("/a/b");
    expect(normalizePath("/")).toBe("/");
  });

  it("reads and writes through the in-memory fallback", async () => {
    const written = await writeBytesSafe("/tmp/x.bin", new Uint8Array([9, 8]));
    expect(written.ok).toBe(true);
    const read = await readBytesSafe("/tmp/x.bin");
    expect(read.ok && Array.from(read.value)).toEqual([9, 8]);
    expect(await browserFs.fileExists("/tmp/x.bin")).toBe(true);
    expect(await browserFs.fileExists("/tmp/missing.bin")).toBe(false);
    expect(browserFs.resolvePath("a\\b")).toBe("/a/b");
  });

  it("reports a clear error for missing text", async () => {
    const result = await readTextSafe("/nope.txt");
    expect(result.ok).toBe(false);
  });

  it("fetches the bundled project and samples over HTTP", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith("lmp-default-proj.lampjson")) {
          return new Response("{}", { status: 200 });
        }
        if (url.includes("SourceSamples/1.ogg")) {
          return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
        }
        return new Response("missing", { status: 404 });
      });

    const samples = await listSourceSamples();
    expect(samples).toHaveLength(6);
    expect(samples[1]!.present).toBe(true);
    expect(samples[0]!.present).toBe(false);

    const song = await loadDefaultSong();
    expect("project" in song && song.project).toBe("{}");
    expect(fetchMock).toHaveBeenCalled();
  });

  it("round-trips config through the storage fallback", async () => {
    const written = await browserConfig.write({
      defaultOpen: { mode: "off" },
    });
    expect(written).toBe(true);
    // No IndexedDB/localStorage in the node test env: read degrades to {}.
    expect(await browserConfig.read()).toEqual({});
    expect(browserConfig.backupPath()).toBe("/backup.lmpjson");
  });

  it("exposes the browser audio bootstrap", () => {
    expect(() => browserAudio.installGlobals()).not.toThrow();
    expect(typeof browserAudio.globalsAvailable()).toBe("boolean");
  });
});
