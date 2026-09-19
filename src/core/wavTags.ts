/**
 * Builds RIFF metadata chunks for WAV export: a `LIST`/`INFO` block (widely
 * read by desktop players) and an `id3 ` chunk holding an ID3v2.3 tag with
 * Title/Artist/Album plus an embedded front-cover picture (APIC).
 */

export interface WavTags {
  title?: string;
  artist?: string;
  album?: string;
  /** PNG bytes embedded as the front cover. */
  artwork?: Uint8Array;
}

const utf8 = new TextEncoder();

/**
 * Appends bytes one at a time. Do NOT use `out.push(...data)`: the embedded
 * cover art (tens of KB) overflows the JS call stack as a spread argument and
 * throws "Maximum call stack size exceeded".
 */
function append(out: number[], data: ArrayLike<number>): void {
  for (let i = 0; i < data.length; i++) out.push(data[i]!);
}

function pushU32LE(out: number[], value: number): void {
  out.push(
    value & 0xff,
    (value >>> 8) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 24) & 0xff,
  );
}

function pushU32BE(out: number[], value: number): void {
  out.push(
    (value >>> 24) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 8) & 0xff,
    value & 0xff,
  );
}

function pushAscii(out: number[], text: string): void {
  for (const ch of text) out.push(ch.charCodeAt(0) & 0xff);
}

/** id + little-endian size + data, padded to an even length. */
function riffChunk(id: string, data: Uint8Array): number[] {
  const out: number[] = [];
  pushAscii(out, id);
  pushU32LE(out, data.length);
  append(out, data);
  if (data.length % 2 === 1) out.push(0);
  return out;
}

/** `LIST`/`INFO` with INAM/IART/IPRD text fields (Latin-1/ASCII). */
function buildInfoChunk(tags: WavTags): number[] {
  const info: number[] = [];
  pushAscii(info, "INFO");
  const sub = (id: string, text: string | undefined) => {
    if (!text) return;
    const bytes = utf8.encode(text);
    const data: number[] = [];
    pushAscii(data, id);
    pushU32LE(data, bytes.length + 1); // + null terminator
    append(data, bytes);
    data.push(0);
    if ((bytes.length + 1) % 2 === 1) data.push(0);
    append(info, data);
  };
  sub("INAM", tags.title);
  sub("IART", tags.artist);
  sub("IPRD", tags.album);
  return riffChunk("LIST", Uint8Array.from(info));
}

function id3Frame(id: string, payload: Uint8Array): number[] {
  const out: number[] = [];
  pushAscii(out, id);
  pushU32BE(out, payload.length);
  out.push(0, 0); // frame flags
  append(out, payload);
  return out;
}

/** ID3v2.3 `TIT2`/`TPE1`/`TALB` text frames and an `APIC` cover, wrapped as an `id3 ` chunk. */
function buildId3Chunk(tags: WavTags): number[] {
  const frames: number[] = [];
  const textFrame = (id: string, text: string | undefined) => {
    if (!text) return;
    const body = new Uint8Array(1 + utf8.encode(text).length);
    body[0] = 0x03; // UTF-8 encoding byte
    body.set(utf8.encode(text), 1);
    append(frames, id3Frame(id, body));
  };
  textFrame("TIT2", tags.title);
  textFrame("TPE1", tags.artist);
  textFrame("TALB", tags.album);
  if (tags.artwork && tags.artwork.length > 0) {
    const mime = utf8.encode("image/png");
    const body = new Uint8Array(
      1 + mime.length + 1 + 1 + 1 + tags.artwork.length,
    );
    let offset = 0;
    body[offset++] = 0x00; // Latin-1 for MIME/description
    body.set(mime, offset);
    offset += mime.length;
    body[offset++] = 0; // MIME terminator
    body[offset++] = 0x03; // picture type 3 = front cover
    body[offset++] = 0; // empty description terminator
    body.set(tags.artwork, offset);
    append(frames, id3Frame("APIC", body));
  }

  const size = frames.length;
  const tag: number[] = [0x49, 0x44, 0x33, 3, 0, 0]; // "ID3" v2.3.0, no flags
  tag.push(
    (size >>> 21) & 0x7f,
    (size >>> 14) & 0x7f,
    (size >>> 7) & 0x7f,
    size & 0x7f,
  );
  append(tag, frames);
  return riffChunk("id3 ", Uint8Array.from(tag));
}

export function buildWavMetadataChunks(tags: WavTags): Uint8Array {
  const info = buildInfoChunk(tags);
  const id3 = buildId3Chunk(tags);
  const out = new Uint8Array(info.length + id3.length);
  out.set(info, 0);
  out.set(id3, info.length);
  return out;
}
