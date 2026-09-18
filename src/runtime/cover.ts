import { crc32 } from "@/core/export";
import { GRID, renderCoverFrame } from "@/core/coverArt";
import type { SongModel } from "@/core/songModel";

/**
 * Minimal zlib writer using DEFLATE "stored" blocks (BTYPE=00).
 *
 * This replaces `node:zlib.deflateSync` so PNG export works in both Node and
 * the browser bundle without a native dependency. Stored blocks do not
 * compress, which is fine for the small cover-art images, and the output is a
 * valid zlib stream every PNG decoder accepts.
 */
export function zlibStore(data: Uint8Array): Uint8Array {
  const MAX = 0xffff;
  const blocks = Math.max(1, Math.ceil(data.length / MAX));
  // 2-byte zlib header + per-block 5-byte header + 4-byte Adler-32 trailer.
  const out = new Uint8Array(2 + blocks * 5 + data.length + 4);
  let offset = 0;
  out[offset++] = 0x78; // CMF: deflate, 32K window
  out[offset++] = 0x01; // FLG: no dict, fastest (0x7801 % 31 === 0)
  for (let i = 0; i < blocks; i++) {
    const start = i * MAX;
    const end = Math.min(data.length, start + MAX);
    const len = end - start;
    const final = i === blocks - 1;
    out[offset++] = final ? 0x01 : 0x00; // BFINAL | BTYPE=00
    out[offset++] = len & 0xff;
    out[offset++] = (len >> 8) & 0xff;
    out[offset++] = ~len & 0xff;
    out[offset++] = (~len >> 8) & 0xff;
    out.set(data.subarray(start, end), offset);
    offset += len;
  }
  const adler = adler32(data);
  out[offset++] = (adler >>> 24) & 0xff;
  out[offset++] = (adler >>> 16) & 0xff;
  out[offset++] = (adler >>> 8) & 0xff;
  out[offset++] = adler & 0xff;
  return out.subarray(0, offset);
}

function adler32(data: Uint8Array): number {
  let a = 1;
  let b = 0;
  for (let i = 0; i < data.length; i++) {
    a = (a + data[i]!) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
}

/** Encodes raw 8-bit RGBA pixels as a PNG (colour type 6, no interlace). */
export function encodePng(
  rgba: Uint8Array,
  width: number,
  height: number,
): Uint8Array {
  const stride = width * 4;
  const raw = new Uint8Array((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    raw.set(
      rgba.subarray(y * stride, y * stride + stride),
      y * (stride + 1) + 1,
    );
  }

  const ihdr = new Uint8Array(13);
  const header = new DataView(ihdr.buffer);
  header.setUint32(0, width);
  header.setUint32(4, height);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const chunks = [
    chunk("IHDR", ihdr),
    chunk("IDAT", zlibStore(raw)),
    chunk("IEND", new Uint8Array(0)),
  ];
  const signature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const total =
    signature.length + chunks.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  out.set(signature, 0);
  let offset = signature.length;
  for (const part of chunks) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  const crcInput = out.subarray(4, 8 + data.length);
  view.setUint32(8 + data.length, crc32(crcInput) >>> 0);
  return out;
}

/** Nearest-neighbour upscale of the 32×32 cover frame. */
export function upscaleCover(
  frame: Uint8ClampedArray,
  size: number,
): Uint8Array {
  const out = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    const sy = Math.min(GRID - 1, Math.floor((y * GRID) / size));
    for (let x = 0; x < size; x++) {
      const sx = Math.min(GRID - 1, Math.floor((x * GRID) / size));
      const src = (sy * GRID + sx) * 4;
      const dst = (y * size + x) * 4;
      out[dst] = frame[src]!;
      out[dst + 1] = frame[src + 1]!;
      out[dst + 2] = frame[src + 2]!;
      out[dst + 3] = frame[src + 3]!;
    }
  }
  return out;
}

export interface CoverExportOptions {
  size?: number;
  time?: number;
  order?: number;
  row?: number;
}

/** Renders the headless cover scene to PNG bytes (default 240×240). */
export function coverPngBytes(
  song: SongModel,
  options: CoverExportOptions = {},
): Uint8Array {
  const size = options.size ?? 240;
  const frame = renderCoverFrame(song, {
    time: options.time,
    order: options.order,
    row: options.row,
  });
  return encodePng(upscaleCover(frame, size), size, size);
}
