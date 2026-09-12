import { describe, expect, it } from "vitest";
import { crc32, wavPcm16, zipStore } from "@/core/export";
import { makeClip } from "@/core/spectral";

function ascii(bytes: Uint8Array, start: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(start, start + length));
}

function view(bytes: Uint8Array): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

describe("WAV export", () => {
  it("writes a canonical 16-bit PCM header and asymmetric sample scaling", () => {
    const clip = makeClip([[0, 0.5, -0.5, 1, -1]], 8000);
    const bytes = wavPcm16(clip);
    const data = view(bytes);

    expect(ascii(bytes, 0, 4)).toBe("RIFF");
    expect(ascii(bytes, 8, 4)).toBe("WAVE");
    expect(ascii(bytes, 12, 4)).toBe("fmt ");
    expect(ascii(bytes, 36, 4)).toBe("data");

    expect(data.getUint16(20, true)).toBe(1); // PCM
    expect(data.getUint16(22, true)).toBe(1); // channels
    expect(data.getUint32(24, true)).toBe(8000); // sample rate
    expect(data.getUint16(34, true)).toBe(16); // bits per sample
    expect(data.getUint32(40, true)).toBe(10); // data size
    expect(data.getUint32(4, true)).toBe(36 + 10);

    expect(data.getInt16(44, true)).toBe(0);
    expect(data.getInt16(46, true)).toBe(Math.trunc(0.5 * 32767));
    expect(data.getInt16(48, true)).toBe(Math.trunc(-0.5 * 32768));
    expect(data.getInt16(50, true)).toBe(32767);
    expect(data.getInt16(52, true)).toBe(-32768);
  });
});

describe("ZIP export", () => {
  it("computes the standard CRC-32 of 123456789", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
  });

  it("writes STORE-method local, central and EOCD records", () => {
    const payload = new TextEncoder().encode("hello");
    const bytes = zipStore([{ name: "a.txt", data: payload }]);
    const data = view(bytes);

    expect(data.getUint32(0, true)).toBe(0x04034b50);
    expect(ascii(bytes, 30, 5)).toBe("a.txt");
    expect(ascii(bytes, 35, 5)).toBe("hello");

    let centralIndex = -1;
    for (let i = 0; i <= bytes.length - 4; i++) {
      if (data.getUint32(i, true) === 0x02014b50) {
        centralIndex = i;
        break;
      }
    }
    expect(centralIndex).toBeGreaterThan(0);
    expect(ascii(bytes, centralIndex + 46, 5)).toBe("a.txt");

    expect(ascii(bytes, bytes.length - 22, 4)).toBe("PK\u0005\u0006");
    expect(data.getUint16(bytes.length - 22 + 10, true)).toBe(1); // total entries
  });
});
