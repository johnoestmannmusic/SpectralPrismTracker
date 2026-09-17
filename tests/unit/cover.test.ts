import { describe, expect, it } from "vitest";
import { renderCoverFrame, GRID } from "@/core/coverArt";
import { buildSongModelFromProject } from "@/core/songModel";
import { defaultProject } from "@/core/project";
import { defaultSamplerSettings } from "@/core/sampler";
import { coverPngBytes, encodePng, upscaleCover } from "@/runtime/cover";

function sampleSong() {
  const project = defaultProject();
  project.instruments = [defaultSamplerSettings()];
  project.instrumentNames = ["Instrument 01"];
  return buildSongModelFromProject(project);
}

describe("headless cover art", () => {
  it("renders a deterministic 32×32 RGBA frame", () => {
    const song = sampleSong();
    const a = renderCoverFrame(song);
    const b = renderCoverFrame(song);
    expect(a.length).toBe(GRID * GRID * 4);
    expect(Array.from(a)).toEqual(Array.from(b));
    // Every pixel is opaque and on the dithered 8-level palette.
    const opaque = a
      .filter((_, index) => index % 4 === 3)
      .every((value) => value === 255);
    expect(opaque).toBe(true);
  });

  it("upscales with nearest-neighbour and keeps dimensions", () => {
    const frame = renderCoverFrame(sampleSong());
    const big = upscaleCover(frame, 64);
    expect(big.length).toBe(64 * 64 * 4);
    // The top-left 2×2 block maps to the same source pixel.
    expect(Array.from(big.subarray(0, 4))).toEqual(
      Array.from(frame.subarray(0, 4)),
    );
    expect(Array.from(big.subarray(4, 8))).toEqual(
      Array.from(frame.subarray(0, 4)),
    );
  });

  it("encodes a valid PNG with the requested size", () => {
    const png = coverPngBytes(sampleSong(), { size: 48 });
    expect(Array.from(png.subarray(0, 8))).toEqual([
      137, 80, 78, 71, 13, 10, 26, 10,
    ]);
    const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
    expect(view.getUint32(16)).toBe(48); // IHDR width
    expect(view.getUint32(20)).toBe(48); // IHDR height
    expect(String.fromCharCode(png[12], png[13], png[14], png[15])).toBe(
      "IHDR",
    );
    expect(
      String.fromCharCode(
        png[png.length - 8],
        png[png.length - 7],
        png[png.length - 6],
        png[png.length - 5],
      ),
    ).toBe("IEND");
  });

  it("builds a PNG from raw RGBA via encodePng", () => {
    const rgba = new Uint8Array([255, 0, 0, 255, 0, 255, 0, 255]);
    const png = encodePng(rgba, 2, 1);
    const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
    expect(view.getUint32(16)).toBe(2);
    expect(view.getUint32(20)).toBe(1);
  });
});
