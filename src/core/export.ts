import { clipIsEmpty, clipLen, type AudioClip } from "./dsp";

function pushU16(out: number[], value: number): void {
  out.push(value & 0xff, (value >>> 8) & 0xff);
}

function pushU32(out: number[], value: number): void {
  out.push(value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff);
}

/** Encodes an AudioClip as a canonical 16-bit PCM WAV file. */
export function wavPcm16(clip: AudioClip): Uint8Array {
  const channels = clip.channels.length;
  if (clipIsEmpty(clip)) throw new Error("Audio clip is empty");
  if (channels > 65535) throw new Error("Too many channels for a WAV file");
  const blockAlign = channels * 2;
  const frames = clipLen(clip);
  const dataSize = frames * blockAlign;
  if (dataSize > 0xffffffff - 36) throw new Error("Audio is too large for a PCM WAV file");

  const out: number[] = [];
  const writeAscii = (s: string) => {
    for (const ch of s) out.push(ch.charCodeAt(0));
  };

  writeAscii("RIFF");
  pushU32(out, 36 + dataSize);
  writeAscii("WAVEfmt ");
  pushU32(out, 16);
  pushU16(out, 1);
  pushU16(out, channels);
  pushU32(out, clip.sampleRate);
  pushU32(out, clip.sampleRate * blockAlign);
  pushU16(out, blockAlign);
  pushU16(out, 16);
  writeAscii("data");
  pushU32(out, dataSize);

  for (let frame = 0; frame < frames; frame++) {
    for (let c = 0; c < channels; c++) {
      const raw = clip.channels[c]![frame]!;
      const sample = Math.min(Math.max(raw, -1), 1);
      const value = sample < 0 ? Math.trunc(sample * 32768) : Math.trunc(sample * 32767);
      pushU16(out, value & 0xffff);
    }
  }

  return Uint8Array.from(out);
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export interface ZipEntry {
  name: string;
  data: Uint8Array;
}

/** Minimal STORE-method (uncompressed) ZIP writer, matching lantern-core. */
export function zipStore(entries: ZipEntry[]): Uint8Array {
  if (entries.length > 65535) throw new Error("Too many ZIP entries");
  const encoder = new TextEncoder();
  const local: number[] = [];
  const central: number[] = [];

  const u16 = (out: number[], v: number) => pushU16(out, v);
  const u32 = (out: number[], v: number) => pushU32(out, v);

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.name);
    if (entry.name.length === 0 || nameBytes.length > 65535) {
      throw new Error("Invalid ZIP entry name");
    }
    for (const byte of nameBytes) {
      if (byte > 0x7f) throw new Error("ZIP entry names must be ASCII");
    }
    const crc = crc32(entry.data);
    const size = entry.data.length;
    const offset = local.length;

    u32(local, 0x04034b50);
    u16(local, 20);
    u16(local, 0);
    u16(local, 0);
    u16(local, 0);
    u16(local, 0x0021);
    u32(local, crc);
    u32(local, size);
    u32(local, size);
    u16(local, nameBytes.length);
    u16(local, 0);
    for (const b of nameBytes) local.push(b);
    for (const b of entry.data) local.push(b);

    u32(central, 0x02014b50);
    u16(central, 20);
    u16(central, 20);
    u16(central, 0);
    u16(central, 0);
    u16(central, 0);
    u16(central, 0x0021);
    u32(central, crc);
    u32(central, size);
    u32(central, size);
    u16(central, nameBytes.length);
    u16(central, 0);
    u16(central, 0);
    u16(central, 0);
    u16(central, 0);
    u32(central, 0);
    u32(central, offset);
    for (const b of nameBytes) central.push(b);
  }

  const centralOffset = local.length;
  const all = local.concat(central);
  u32(all, 0x06054b50);
  u16(all, 0);
  u16(all, 0);
  u16(all, entries.length);
  u16(all, entries.length);
  u32(all, central.length);
  u32(all, centralOffset);
  u16(all, 0);

  return Uint8Array.from(all);
}
