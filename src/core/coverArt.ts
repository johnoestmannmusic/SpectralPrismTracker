import type { SongModel } from "./songModel";
import { songPositionAt } from "./timing";

/**
 * Headless port of the animated cover-art scene (formerly the React/DOM
 * `CoverArt.tsx`). Renders the same 32×32 RGB buffer + 4×4 Bayer dither to
 * 8-level palette; callers upscale and encode it (see `src/runtime/png.ts`).
 */

export const GRID = 32;
const TAU = Math.PI * 2;
const BAYER = [
  0.03125, 0.53125, 0.15625, 0.65625, 0.78125, 0.28125, 0.90625, 0.40625,
  0.21875, 0.71875, 0.09375, 0.59375, 0.96875, 0.46875, 0.84375, 0.34375,
];
const CHANNEL_ANGLES = [-Math.PI / 2, 0, Math.PI / 2, Math.PI];

const VAT_LEFT = 9;
const VAT_RIGHT = 22;
const VAT_TOP = 5;
const VAT_BOTTOM = 28;
const VAT_CX = (VAT_LEFT + VAT_RIGHT + 1) / 2;
const VAT_CY = (VAT_TOP + VAT_BOTTOM + 1) / 2;

export interface CoverPulse {
  angle: number;
  age: number;
  maxAge: number;
  color: [number, number, number];
  width: number;
}

export interface CoverState {
  time: number;
  overall: number;
  phases: Float32Array;
  speeds: Float32Array;
  pulses: CoverPulse[];
  lastPosition: string | null;
}

export function createCoverState(): CoverState {
  return {
    time: 0,
    overall: 0,
    phases: new Float32Array(256),
    speeds: new Float32Array(256),
    pulses: [],
    lastPosition: null,
  };
}

function randomWithSeed(seed: number): number {
  const s = (seed + 0x6d2b79f5) >>> 0;
  let v = s;
  v = Math.imul(v ^ (v >>> 15), v | 1) >>> 0;
  v = (v ^ (v + Math.imul(v ^ (v >>> 7), v | 61))) >>> 0;
  return ((v ^ (v >>> 14)) >>> 0) / 4294967296;
}

function makeRandom(): () => number {
  let seed = 9001 >>> 0;
  return () => {
    seed = (seed + 0x6d2b79f5) >>> 0;
    let v = seed;
    v = Math.imul(v ^ (v >>> 15), v | 1) >>> 0;
    v = (v ^ (v + Math.imul(v ^ (v >>> 7), v | 61))) >>> 0;
    return ((v ^ (v >>> 14)) >>> 0) / 4294967296;
  };
}

/** Seeds the monitor-wall phase/speed tables (deterministic). */
export function seedCoverState(state: CoverState): void {
  const random = makeRandom();
  for (let i = 0; i < 256; i++) {
    state.phases[i] = random() * TAU;
    state.speeds[i] = 0.12 + random() * 0.3;
  }
}

export function dither(value: number, x: number, y: number): number {
  const v = Math.min(Math.max(value, 0), 255);
  const step = 255 / 8;
  const scaled = v / step;
  const base = Math.floor(scaled);
  const level = base + (scaled - base > BAYER[(y & 3) * 4 + (x & 3)]! ? 1 : 0);
  return Math.round(Math.min(level, 8) * step);
}

function blend(
  buffer: Float32Array,
  x: number,
  y: number,
  color: number[],
  amount: number,
): void {
  if (x < 0 || y < 0 || x >= GRID || y >= GRID) return;
  const index = (y * GRID + x) * 3;
  const a = Math.min(Math.max(amount, 0), 1);
  for (let c = 0; c < 3; c++) {
    buffer[index + c] =
      buffer[index + c]! + (color[c]! - buffer[index + c]!) * a;
  }
}

function addGlow(
  buffer: Float32Array,
  cx: number,
  cy: number,
  radius: number,
  color: number[],
  intensity: number,
): void {
  const x0 = Math.max(0, Math.floor(cx - radius));
  const x1 = Math.min(GRID - 1, Math.ceil(cx + radius));
  const y0 = Math.max(0, Math.floor(cy - radius));
  const y1 = Math.min(GRID - 1, Math.ceil(cy + radius));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const distance = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      const amount = Math.max(0, 1 - distance / radius) * intensity;
      if (amount > 0) blend(buffer, x, y, color, amount);
    }
  }
}

function addArc(
  buffer: Float32Array,
  radius: number,
  angle: number,
  width: number,
  thickness: number,
  color: number[],
  intensity: number,
): void {
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      const dx = x + 0.5 - VAT_CX;
      const dy = y + 0.5 - VAT_CY;
      const distance = Math.hypot(dx, dy);
      const radial = 1 - Math.abs(distance - radius) / thickness;
      let delta = (Math.atan2(dy, dx) - angle) % TAU;
      if (delta > Math.PI) delta -= TAU;
      if (delta <= -Math.PI) delta += TAU;
      const angular = 1 - Math.abs(delta) / (width * 0.5);
      const amount = Math.min(
        Math.max(Math.min(radial, angular) * intensity, 0),
        1,
      );
      if (amount > 0) blend(buffer, x, y, color, amount);
    }
  }
}

export function spawnPulses(
  state: CoverState,
  song: SongModel,
  order: number,
  row: number,
): void {
  for (let ch = 0; ch < Math.min(song.channels.length, 4); ch++) {
    const channel = song.channels[ch]!;
    const patternIndex = channel.orderList[order];
    const cell =
      patternIndex === undefined
        ? undefined
        : channel.patterns.get(patternIndex)?.rows[row];
    const note = cell?.note;
    if (!note || (note.kind !== "note" && note.kind !== "rawFreq")) continue;
    const instrument = channel.insTimeline[order]?.[row] ?? null;
    const info = instrument !== null ? song.instruments[instrument] : undefined;
    const color: [number, number, number] = info
      ? [info.colorRgb[0], info.colorRgb[1], info.colorRgb[2]]
      : [201, 151, 58];
    const volume = Math.min(Math.max((cell.volume ?? 15) / 15, 0.15), 1);
    state.overall = Math.max(state.overall, volume);
    const seed = ((order * 0x9e3779b9) ^ (row * 0x85ebca6b) ^ ch) >>> 0;
    const jitter = (randomWithSeed(seed) * 2 - 1) * 0.3;
    state.pulses.push({
      angle: (CHANNEL_ANGLES[ch] ?? 0) + jitter,
      age: 0,
      maxAge: 0.32 + volume * 0.28,
      color,
      width: 0.6 + volume * 0.8,
    });
  }
}

/** Advances animation state. `playing`/`time` normally come from the backend. */
export function stepCover(
  state: CoverState,
  song: SongModel,
  transport: { playing: boolean; time: number },
  dt: number,
): void {
  state.time += dt;
  state.overall = Math.max(0, state.overall - dt * 0.7);
  const key = transport.playing
    ? (() => {
        const pos = songPositionAt(song, transport.time);
        return `${pos.orderPos}:${pos.row}`;
      })()
    : null;
  if (transport.playing && key && key !== state.lastPosition) {
    const pos = songPositionAt(song, transport.time);
    spawnPulses(state, song, pos.orderPos, pos.row);
  }
  state.lastPosition = key;
  for (const pulse of state.pulses) pulse.age += dt;
  state.pulses = state.pulses.filter((p) => p.age < p.maxAge);
}

function drawScreens(buffer: Float32Array, state: CoverState): void {
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      blend(buffer, x, y, [6, 9, 16], 1);
      if (x % 6 === 0 || y % 5 === 0) continue;
      const panel = (Math.floor(y / 5) * 6 + Math.floor(x / 6)) % 256;
      const wave =
        0.5 +
        0.5 *
          Math.sin(
            state.time * state.speeds[panel]! * TAU + state.phases[panel]!,
          );
      let color = [10 + 12 * wave, 20 + 26 * wave, 38 + 46 * wave];
      const scan =
        (state.time * (0.8 + state.speeds[panel]! * 1.2) +
          state.phases[panel]! * 5) %
        5;
      if (Math.abs((y % 5) - scan) < 0.7) {
        color = [color[0]! + 14, color[1]! + 34, color[2]! + 58];
      }
      blend(buffer, x, y, color, 0.92);
    }
  }
}

function drawVat(buffer: Float32Array, state: CoverState): void {
  const width = VAT_RIGHT - VAT_LEFT;
  const liquidTop = VAT_TOP + 3;
  for (let y = VAT_TOP; y <= VAT_BOTTOM; y++) {
    const capDist = Math.min(y - VAT_TOP, VAT_BOTTOM - y);
    const inset = capDist <= 0 ? 2 : capDist === 1 ? 1 : 0;
    for (let x = VAT_LEFT; x <= VAT_RIGHT; x++) {
      const ux = (x - VAT_LEFT + 0.5) / (width + 1);
      const specular = Math.exp(-Math.pow((ux - 0.3) / 0.16, 2));
      const rimDark = Math.pow(Math.abs(ux - 0.5) * 2, 2);
      const glassWall =
        x <= VAT_LEFT + inset ||
        x >= VAT_RIGHT - inset ||
        y <= VAT_TOP + inset ||
        y >= VAT_BOTTOM - inset;
      if (glassWall) {
        const shade = 0.7 + 0.5 * specular - 0.3 * rimDark;
        blend(
          buffer,
          x,
          y,
          [98 * shade + 34, 138 * shade + 44, 168 * shade + 54],
          0.9,
        );
        continue;
      }
      const depth = Math.max(
        0,
        Math.min(1, (y - liquidTop) / Math.max(VAT_BOTTOM - liquidTop, 1)),
      );
      const lit = 0.62 + 0.6 * specular - 0.4 * rimDark;
      const base = [
        16 + 30 * (1 - depth),
        52 + 86 * (1 - depth),
        28 + 42 * (1 - depth),
      ];
      blend(
        buffer,
        x,
        y,
        [base[0]! * lit, base[1]! * lit, base[2]! * lit],
        0.64,
      );
    }
  }
  for (let x = VAT_LEFT + 2; x <= VAT_RIGHT - 2; x++) {
    blend(buffer, x, liquidTop, [150, 232, 165], 0.38);
  }
  for (let y = VAT_TOP + 3; y <= VAT_BOTTOM - 2; y++) {
    blend(buffer, VAT_LEFT + 2, y, [215, 238, 248], 0.3);
    blend(buffer, VAT_RIGHT - 1, y, [170, 200, 220], 0.12);
  }
  for (let x = VAT_LEFT + 3; x <= VAT_RIGHT - 3; x++) {
    blend(buffer, x, VAT_TOP + 1, [120, 160, 185], 0.18);
  }
  for (let x = VAT_LEFT - 1; x <= VAT_RIGHT + 1; x++) {
    blend(buffer, x, VAT_BOTTOM + 1, [66, 90, 110], 0.85);
  }
  for (let i = 0; i < 5; i++) {
    const t = (state.time * 0.28 + i * 0.19) % 1;
    const bx =
      VAT_LEFT + 2 + ((i * 3.3) % Math.max(VAT_RIGHT - VAT_LEFT - 3, 1));
    const by = VAT_BOTTOM - 1 - t * (VAT_BOTTOM - VAT_TOP - 2);
    blend(
      buffer,
      Math.floor(bx),
      Math.floor(by),
      [130, 205, 150],
      0.32 * (1 - t),
    );
  }
}

function drawPlant(buffer: Float32Array, state: CoverState): void {
  const baseY = VAT_BOTTOM - 1;
  const fullTop = VAT_TOP + 3;
  const growth = Math.min(1, state.time * 0.18);

  let jiggle = 0;
  for (const pulse of state.pulses) {
    const t = pulse.age / pulse.maxAge;
    const env = t < 0.2 ? t / 0.2 : 1 - (t - 0.2) / 0.8;
    jiggle += (Math.sin(pulse.angle) + Math.cos(pulse.angle)) * env * 1.4;
  }
  const sway = Math.sin(state.time * 1.6) * 1.3 + jiggle;
  const topY = baseY - growth * (baseY - fullTop);
  const vibrancy = 0.85 + state.overall * 0.15;

  for (let dy = 0; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      blend(buffer, Math.round(VAT_CX) + dx, baseY - dy, [120, 210, 120], 0.7);
    }
  }

  const span = Math.max(baseY - topY, 1);
  for (let y = baseY; y >= Math.ceil(topY); y--) {
    const t = (baseY - y) / span;
    const x = VAT_CX - 0.5 + sway * t * t;
    const xi = Math.round(x);
    blend(buffer, xi, y, [70 * vibrancy, 205 * vibrancy, 85 * vibrancy], 0.95);
    blend(buffer, xi + 1, y, [30, 120, 50], 0.5);
    if (y % 5 === 0 && t > 0.2) {
      const dir = Math.floor(y / 5) % 2 === 0 ? -1 : 1;
      const lx = xi + dir * 2;
      blend(buffer, lx, y, [95, 220, 95], 0.9);
      blend(buffer, lx + dir, y, [55, 160, 60], 0.7);
      blend(buffer, lx, y - 1, [130, 235, 120], 0.6);
    }
  }
  const tipX = Math.round(VAT_CX - 0.5 + sway);
  blend(buffer, tipX, Math.floor(topY) - 1, [160, 240, 140], 0.8);
}

function drawAuras(buffer: Float32Array, state: CoverState): void {
  for (const pulse of state.pulses) {
    const t = pulse.age / pulse.maxAge;
    const envelope = t < 0.2 ? t / 0.2 : 1 - (t - 0.2) / 0.8;
    const auraX = VAT_CX + Math.cos(pulse.angle) * 2.4;
    const auraY = VAT_CY + Math.sin(pulse.angle) * 2.4;
    addGlow(buffer, auraX, auraY, 2.7, pulse.color, envelope * 0.9);
    addArc(
      buffer,
      (VAT_RIGHT - VAT_LEFT) / 2 + 0.5,
      pulse.angle,
      pulse.width,
      1.4,
      pulse.color,
      envelope * 1.5,
    );
  }
}

/** Renders the current state into an RGBA byte buffer (GRID×GRID). */
export function renderCover(state: CoverState, data: Uint8ClampedArray): void {
  const buffer = new Float32Array(GRID * GRID * 3);
  drawScreens(buffer, state);
  drawVat(buffer, state);
  drawPlant(buffer, state);
  drawAuras(buffer, state);
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      const index = (y * GRID + x) * 3;
      const p = (y * GRID + x) * 4;
      data[p] = dither(buffer[index]!, x, y);
      data[p + 1] = dither(buffer[index + 1]!, x, y);
      data[p + 2] = dither(buffer[index + 2]!, x, y);
      data[p + 3] = 255;
    }
  }
}

/**
 * Renders a single deterministic frame (fully-grown plant, auras from the
 * song's first row) suitable for WAV artwork / PNG export.
 */
export function renderCoverFrame(
  song: SongModel,
  options: { time?: number; order?: number; row?: number } = {},
): Uint8ClampedArray {
  const state = createCoverState();
  seedCoverState(state);
  state.time = options.time ?? 6;
  spawnPulses(state, song, options.order ?? 0, options.row ?? 0);
  for (const pulse of state.pulses) pulse.age = pulse.maxAge * 0.15;
  const data = new Uint8ClampedArray(GRID * GRID * 4);
  renderCover(state, data);
  return data;
}
