// GTA 6 meme generator — make.fun bounty gta6-meme-x-01
//
// A GTA 6 launch-week meme, drawn programmatically at run time: a Vice City
// sunset (purple -> magenta -> orange sky, retro sun, ocean, skyline, palm
// silhouettes) with make.fun's white ghost mascot centre stage holding a
// magenta star coin. The joke: after waiting 13 years for GTA 6, the
// entrant's AI agent made this meme — and got paid for it on make.fun.
//
// Node 22, standard library only (node:fs, node:path, node:zlib). No
// network, no wall clock, no files outside the repository, deterministic:
// the same run always writes the same bytes.
//
//   mkdir -p out && MAKEFUN_BOT_DIR=. MAKEFUN_OUTPUT_DIR=out node main.ts
//
// Writes meme.png (1024x1024) and a copy of POST.json into the output dir.

import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';

const BOT_DIR = process.env.MAKEFUN_BOT_DIR ?? '/bot';
const OUTPUT_DIR = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

const W = 1024;
const H = 1024;

// ---------------------------------------------------------------- PNG ----
// Minimal PNG writer: raw RGBA scanlines (filter 0), zlib deflate, CRC32.

const CRC_TABLE: Uint32Array = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

function encodePng(rgba: Buffer, width: number, height: number): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type 6 = RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace
  const raw = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    raw[y * (1 + width * 4)] = 0; // filter: none
    rgba.copy(raw, y * (1 + width * 4) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ------------------------------------------------------------ colours ----

type RGB = [number, number, number];

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function mix(c1: RGB, c2: RGB, t: number): RGB {
  return [lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t)];
}

// Deterministic PRNG (mulberry32) — no wall clock, same picture every run.
function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ------------------------------------------------------------- canvas ----

const px = new Uint8Array(W * H * 4); // RGBA, opaque

function setPixel(x: number, y: number, c: RGB): void {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  if (ix < 0 || ix >= W || iy < 0 || iy >= H) return;
  const o = (iy * W + ix) * 4;
  px[o] = c[0];
  px[o + 1] = c[1];
  px[o + 2] = c[2];
  px[o + 3] = 255;
}

function fillRect(x0: number, y0: number, x1: number, y1: number, c: RGB): void {
  for (let y = Math.max(0, Math.floor(y0)); y < Math.min(H, Math.ceil(y1)); y++) {
    for (let x = Math.max(0, Math.floor(x0)); x < Math.min(W, Math.ceil(x1)); x++) {
      setPixel(x, y, c);
    }
  }
}

function fillDisc(cx: number, cy: number, r: number, c: RGB): void {
  const r2 = r * r;
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy <= r2) setPixel(x, y, c);
    }
  }
}

function fillEllipse(cx: number, cy: number, rx: number, ry: number, c: RGB): void {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const dx = (x - cx) / rx;
      const dy = (y - cy) / ry;
      if (dx * dx + dy * dy <= 1) setPixel(x, y, c);
    }
  }
}

// Thick line: walk the segment stamping discs.
function thickLine(x0: number, y0: number, x1: number, y1: number, w: number, c: RGB): void {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.max(1, Math.hypot(dx, dy));
  const steps = Math.ceil(len);
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    fillDisc(x0 + dx * t, y0 + dy * t, w / 2, c);
  }
}

// Even-odd scanline polygon fill.
function fillPolygon(points: Array<[number, number]>, c: RGB): void {
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [, y] of points) {
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  for (let y = Math.max(0, Math.floor(minY)); y <= Math.min(H - 1, Math.ceil(maxY)); y++) {
    const xs: number[] = [];
    for (let i = 0; i < points.length; i++) {
      const [x0, y0] = points[i];
      const [x1, y1] = points[(i + 1) % points.length];
      if ((y0 <= y && y1 > y) || (y1 <= y && y0 > y)) {
        xs.push(x0 + ((y - y0) / (y1 - y0)) * (x1 - x0));
      }
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      for (let x = Math.max(0, Math.ceil(xs[k])); x <= Math.min(W - 1, xs[k + 1]); x++) {
        setPixel(x, y, c);
      }
    }
  }
}

// Star polygon (5 points): outer radius R, inner radius r.
function starPoints(cx: number, cy: number, R: number, r: number, rot = -Math.PI / 2): Array<[number, number]> {
  const pts: Array<[number, number]> = [];
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 === 0 ? R : r;
    const a = rot + (i * Math.PI) / 5;
    pts.push([cx + rad * Math.cos(a), cy + rad * Math.sin(a)]);
  }
  return pts;
}

// ---------------------------------------------------------------- font ----
// 5x7 bitmap font, one string per glyph: 7 rows of 5 bits joined by "/".

const FONT: Record<string, string> = {
  A: '01110/10001/10001/11111/10001/10001/10001',
  B: '11110/10001/10001/11110/10001/10001/11110',
  C: '01110/10001/10000/10000/10000/10001/01110',
  D: '11110/10001/10001/10001/10001/10001/11110',
  E: '11111/10000/10000/11110/10000/10000/11111',
  F: '11111/10000/10000/11110/10000/10000/10000',
  G: '01110/10001/10000/10111/10001/10001/01111',
  H: '10001/10001/10001/11111/10001/10001/10001',
  I: '01110/00100/00100/00100/00100/00100/01110',
  J: '00111/00010/00010/00010/00010/10010/01100',
  K: '10001/10010/10100/11000/10100/10010/10001',
  L: '10000/10000/10000/10000/10000/10000/11111',
  M: '10001/11011/10101/10101/10001/10001/10001',
  N: '10001/11001/10101/10011/10001/10001/10001',
  O: '01110/10001/10001/10001/10001/10001/01110',
  P: '11110/10001/10001/11110/10000/10000/10000',
  Q: '01110/10001/10001/10001/10101/10010/01101',
  R: '11110/10001/10001/11110/10100/10010/10001',
  S: '01111/10000/10000/01110/00001/00001/11110',
  T: '11111/00100/00100/00100/00100/00100/00100',
  U: '10001/10001/10001/10001/10001/10001/01110',
  V: '10001/10001/10001/10001/10001/01010/00100',
  W: '10001/10001/10001/10101/10101/11011/10001',
  X: '10001/10001/01010/00100/01010/10001/10001',
  Y: '10001/10001/01010/00100/00100/00100/00100',
  Z: '11111/00001/00010/00100/01000/10000/11111',
  '0': '01110/10001/10011/10101/11001/10001/01110',
  '1': '00100/01100/00100/00100/00100/00100/01110',
  '2': '01110/10001/00001/00110/01000/10000/11111',
  '3': '11111/00010/00100/00010/00001/10001/01110',
  '4': '00010/00110/01010/10010/11111/00010/00010',
  '5': '11111/10000/11110/00001/00001/10001/01110',
  '6': '01110/10000/10000/11110/10001/10001/01110',
  '7': '11111/00001/00010/00100/01000/01000/01000',
  '8': '01110/10001/10001/01110/10001/10001/01110',
  '9': '01110/10001/10001/01111/00001/00001/01110',
  ' ': '00000/00000/00000/00000/00000/00000/00000',
  '.': '00000/00000/00000/00000/00000/01100/01100',
  ',': '00000/00000/00000/00000/01100/00100/01000',
  "'": '00100/00100/01000/00000/00000/00000/00000',
  '-': '00000/00000/00000/01110/00000/00000/00000',
  '!': '00100/00100/00100/00100/00100/00000/00100',
  ':': '00000/01100/01100/00000/01100/01100/00000',
  '/': '00001/00010/00010/00100/01000/01000/10000',
  '•': '00000/00000/01100/01100/01100/00000/00000',
  '(': '00010/00100/01000/01000/01000/00100/00010',
  ')': '01000/00100/00010/00010/00010/00100/01000',
};

const BLANK = '00000/00000/00000/00000/00000/00000/00000';

function textWidth(text: string, scale: number): number {
  return text.length * 6 * scale - scale;
}

// Draw one line of text, left-aligned at (x, y), in colour c.
// Lowercase letters are drawn as their uppercase glyph.
function drawText(x: number, y: number, text: string, scale: number, c: RGB): void {
  for (let i = 0; i < text.length; i++) {
    const ch = text[i].toUpperCase();
    const rows = (FONT[ch] ?? BLANK).split('/');
    for (let r = 0; r < 7; r++) {
      for (let col = 0; col < 5; col++) {
        if (rows[r][col] === '1') {
          fillRect(x + i * 6 * scale + col * scale, y + r * scale, x + i * 6 * scale + (col + 1) * scale, y + (r + 1) * scale, c);
        }
      }
    }
  }
}

// Centred text with a dark outline so it reads at small sizes.
function drawTextCentred(y: number, text: string, scale: number, c: RGB, outline: RGB): void {
  const w = textWidth(text, scale);
  const x = Math.round((W - w) / 2);
  const o = Math.max(2, Math.round(scale / 2));
  for (const [dx, dy] of [[-o, 0], [o, 0], [0, -o], [0, o], [-o, -o], [o, -o], [-o, o], [o, o]] as const) {
    drawText(x + dx, y + dy, text, scale, outline);
  }
  drawText(x, y, text, scale, c);
}

// ---------------------------------------------------------------- scene ----

const INK: RGB = [13, 5, 24]; // near-black purple: silhouettes + text outline
const WHITE: RGB = [255, 255, 255];
const GHOST: RGB = [255, 255, 255];
const MAGENTA: RGB = [255, 46, 166]; // make.fun star coin
const SUN_COL: RGB = [255, 233, 168];

function drawScene(): void {
  const rnd = mulberry32(0x6d61746e); // fixed seed: deterministic stars/windows

  // Sky: deep purple -> hot magenta -> orange at the horizon (y 0..640).
  const skyStops: Array<[number, RGB]> = [
    [0, [26, 11, 46]],
    [0.45, [122, 28, 120]],
    [0.8, [226, 62, 120]],
    [1, [255, 126, 41]],
  ];
  for (let y = 0; y < 640; y++) {
    const t = y / 640;
    let a = skyStops[0];
    let b = skyStops[skyStops.length - 1];
    for (let i = 0; i < skyStops.length - 1; i++) {
      if (t >= skyStops[i][0] && t <= skyStops[i + 1][0]) {
        a = skyStops[i];
        b = skyStops[i + 1];
        break;
      }
    }
    const tt = (t - a[0]) / Math.max(0.0001, b[0] - a[0]);
    const c = mix(a[1], b[1], Math.min(1, Math.max(0, tt)));
    for (let x = 0; x < W; x++) setPixel(x, y, c);
  }

  // Stars in the upper sky.
  for (let i = 0; i < 70; i++) {
    const x = Math.floor(rnd() * W);
    const y = Math.floor(rnd() * 260);
    const r = rnd() < 0.85 ? 1 : 2;
    fillDisc(x, y, r, [255, 255, 255]);
  }

  // Retro sun with horizontal slits, low over the horizon.
  const sunCx = 512;
  const sunCy = 360;
  const sunR = 150;
  fillDisc(sunCx, sunCy, sunR, SUN_COL);
  // Slits: sky-coloured bars across the sun's lower half, widening downward.
  const slitYs = [400, 425, 452, 482, 515];
  for (let i = 0; i < slitYs.length; i++) {
    const y = slitYs[i];
    const half = Math.sqrt(Math.max(0, sunR * sunR - (y - sunCy) * (y - sunCy)));
    const h = 4 + i * 3;
    const t = y / 640;
    const skyHere = mix([122, 28, 120], [255, 126, 41], Math.min(1, Math.max(0, (t - 0.45) / 0.55)));
    fillRect(sunCx - half, y, sunCx + half, y + h, skyHere);
  }

  // Ocean: dark teal, lighter toward the horizon.
  for (let y = 640; y < H; y++) {
    const t = (y - 640) / (H - 640);
    const c = mix([16, 90, 104], [5, 34, 46], t);
    for (let x = 0; x < W; x++) setPixel(x, y, c);
  }
  // Sun reflection: shimmering column under the sun.
  for (let i = 0; i < 26; i++) {
    const y = 660 + i * 14;
    const wob = 26 + rnd() * 60;
    const cx = 512 + (rnd() - 0.5) * 70;
    fillRect(cx - wob / 2, y, cx + wob / 2, y + 5, [64, 170, 180]);
  }

  // City skyline silhouette on the horizon.
  let bx = 0;
  while (bx < W) {
    const bw = 34 + Math.floor(rnd() * 46);
    const bh = 24 + Math.floor(rnd() * 64);
    fillRect(bx, 640 - bh, bx + bw, 640, INK);
    // A few lit windows.
    const wins = Math.floor(rnd() * 6);
    for (let k = 0; k < wins; k++) {
      const wx = bx + 6 + Math.floor(rnd() * Math.max(1, bw - 12));
      const wy = 640 - bh + 6 + Math.floor(rnd() * Math.max(1, bh - 14));
      fillRect(wx, wy, wx + 4, wy + 6, [255, 209, 102]);
    }
    bx += bw + 4 + Math.floor(rnd() * 14);
  }

  // Palm silhouettes leaning in from both edges.
  drawPalm(70, 1024, 205, 660, -1);
  drawPalm(954, 1024, 819, 668, 1);

  // ---- make.fun ghost, centre stage ----
  drawGhost(512, 300);

  // Magenta star coin floating by the ghost.
  fillPolygon(starPoints(742, 330, 52, 22), MAGENTA);
  fillDisc(726, 314, 6, WHITE);
  fillDisc(758, 352, 4, WHITE);

  // ---- captions ----
  drawTextCentred(46, 'WAITED 13 YEARS', 7, WHITE, INK);
  drawTextCentred(112, 'FOR GTA 6...', 7, WHITE, INK);
  drawTextCentred(742, 'MY AGENT MADE THIS MEME', 5, WHITE, INK);
  drawTextCentred(812, 'AND GOT PAID ON MAKE.FUN', 5, MAGENTA, INK);
  drawTextCentred(916, 'GTA VI  •  LEONIDA', 3, [255, 233, 168], INK);
  // Magenta underline under the make.fun line.
  const lineW = textWidth('AND GOT PAID ON MAKE.FUN', 5);
  const lx = Math.round((W - lineW) / 2);
  fillRect(lx + textWidth('AND GOT PAID ON ', 5), 812 + 5 * 7 + 8, lx + lineW, 812 + 5 * 7 + 14, MAGENTA);
}

// One palm tree: curved trunk from (baseX, baseY) to (topX, topY),
// fronds fanning out from the top. dir: -1 leans right, 1 leans left.
function drawPalm(baseX: number, baseY: number, topX: number, topY: number, dir: number): void {
  const segs = 24;
  let px0 = baseX;
  let py0 = baseY;
  for (let i = 1; i <= segs; i++) {
    const t = i / segs;
    const x = baseX + (topX - baseX) * t + dir * 26 * Math.sin(t * Math.PI * 0.5);
    const y = baseY + (topY - baseY) * t;
    thickLine(px0, py0, x, y, 16 - 9 * t, INK);
    px0 = x;
    py0 = y;
  }
  // Fronds: 7 tapered quadratic arcs fanning out from the crown and
  // drooping at the tips. Offsets are (dx, dy) from the crown; mirrored
  // for the right-hand palm.
  const crownX = topX + dir * 26;
  const crownY = topY;
  const tips: Array<[number, number]> = [
    [-215, -40], [-190, -105], [-140, -150], [-75, -170], [-10, -150], [40, -100], [75, -30],
  ];
  for (const [tx, ty] of tips) {
    const dx = dir === -1 ? tx : -tx;
    const ex = crownX + dx;
    const ey = crownY + ty + 70; // droop at the tip
    const cx = crownX + dx * 0.5;
    const cy = crownY + ty * 0.5 - 55; // control point lifts the arc
    const steps = 20;
    let qx = crownX;
    let qy = crownY;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const nx = (1 - t) * (1 - t) * crownX + 2 * (1 - t) * t * cx + t * t * ex;
      const ny = (1 - t) * (1 - t) * crownY + 2 * (1 - t) * t * cy + t * t * ey;
      thickLine(qx, qy, nx, ny, 13 - 10 * t, INK);
      qx = nx;
      qy = ny;
    }
  }
  // Coconuts.
  fillDisc(crownX - 12, crownY + 12, 9, INK);
  fillDisc(crownX + 10, crownY + 16, 8, INK);
}

// make.fun's white ghost: rounded head, straight sides, three wavy feet,
// two black oval eyes with sparkles, small open mouth. (x, y) = top centre.
function drawGhost(x: number, y: number): void {
  const R = 120; // head radius / half body width
  const bodyTop = y + R;
  const bodyBottom = y + 330;
  // Head + body.
  fillDisc(x, bodyTop, R, GHOST);
  fillRect(x - R, bodyTop, x + R, bodyBottom, GHOST);
  // Three wavy feet (downward semicircles); adjacent lobes meet in cusps,
  // giving the classic ghost hem.
  for (const fx of [x - 80, x, x + 80]) {
    fillDisc(fx, bodyBottom, 40, GHOST);
  }
  // Eyes: black ovals with white sparkles.
  fillEllipse(x - 46, y + 150, 17, 26, [0, 0, 0]);
  fillEllipse(x + 46, y + 150, 17, 26, [0, 0, 0]);
  fillDisc(x - 52, y + 140, 5, WHITE);
  fillDisc(x + 40, y + 140, 5, WHITE);
  // Small open mouth.
  fillEllipse(x, y + 205, 11, 15, [0, 0, 0]);
}

// ------------------------------------------------------------------ main ----

function main(): void {
  mkdirSync(OUTPUT_DIR, { recursive: true });
  drawScene();
  const png = encodePng(Buffer.from(px), W, H);
  writeFileSync(join(OUTPUT_DIR, 'meme.png'), png);
  try {
    copyFileSync(join(BOT_DIR, 'POST.json'), join(OUTPUT_DIR, 'POST.json'));
  } catch (err) {
    console.error(`POST.json could not be copied from ${BOT_DIR}: ${(err as Error).message}`);
    process.exit(1);
  }
}

main();
