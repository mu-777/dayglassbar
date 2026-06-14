// Icon DESIGN CANDIDATES — non-destructive exploration (does NOT touch
// assets/icon.png etc.). Renders 4 concepts at multiple sizes plus a single
// contact-sheet for comparing small-size legibility on light/dark backgrounds.
// Run: node tools/gen-icon-candidates.mjs  → writes into ../assets/candidates
//
// Concepts:
//   A hourglass        — leans on "Glass" in the name; time + draining
//   B hybrid (bar×glass) — flat-topped "bars" pinched at an hourglass waist
//   C edge-bar         — a screen with the ambient bar on its right edge
//   D sun-arc          — the sun descending a day's arc (calmest)
import zlib from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(here, '..', 'assets', 'candidates');

// ---- PNG encoder (RGBA, 8-bit) ----
function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}
function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}
function encodePngOf(c) { return encodePng(c.w, c.h, c.px); }
function encodePng(width, height, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

// ---- canvas + compositing ----
function canvas(size) { return { size, w: size, h: size, px: Buffer.alloc(size * size * 4) }; }
function canvasWH(w, h) { return { size: w, w, h, px: Buffer.alloc(w * h * 4) }; }
function setPx(c, x, y, [r, g, b], a) {
  if (x < 0 || y < 0 || x >= c.w || y >= c.h || a <= 0) return;
  const i = (y * c.w + x) * 4;
  const sa = a / 255, da = c.px[i + 3] / 255, oa = sa + da * (1 - sa);
  if (oa <= 0) return;
  for (let k = 0; k < 3; k++) {
    const sc = [r, g, b][k], dc = c.px[i + k];
    c.px[i + k] = Math.round((sc * sa + dc * da * (1 - sa)) / oa);
  }
  c.px[i + 3] = Math.round(oa * 255);
}
function blit(dst, src, ox, oy) {
  for (let y = 0; y < src.size; y++)
    for (let x = 0; x < src.size; x++) {
      const i = (y * src.size + x) * 4;
      setPx(dst, ox + x, oy + y, [src.px[i], src.px[i + 1], src.px[i + 2]], src.px[i + 3]);
    }
}
function rect(c, x0, y0, w, h, color, a = 255) {
  for (let y = Math.max(0, y0); y < Math.min(c.h, y0 + h); y++)
    for (let x = Math.max(0, x0); x < Math.min(c.w, x0 + w); x++)
      setPx(c, x, y, color, a);
}

// Supersampled fill from an inside(px,py) predicate → crisp anti-aliasing.
function paint(c, inside, color, alpha = 255, samples = 4) {
  for (let y = 0; y < c.size; y++)
    for (let x = 0; x < c.size; x++) {
      let hit = 0;
      for (let sy = 0; sy < samples; sy++)
        for (let sx = 0; sx < samples; sx++)
          if (inside(x + (sx + 0.5) / samples, y + (sy + 0.5) / samples)) hit++;
      if (hit) setPx(c, x, y, color, Math.round((alpha * hit) / (samples * samples)));
    }
}

// ---- geometry predicates (pixel coords) ----
const inPoly = (px, py, pts) => {
  let pos = false, neg = false;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const cross = (b[0] - a[0]) * (py - a[1]) - (b[1] - a[1]) * (px - a[0]);
    if (cross > 0) pos = true; else if (cross < 0) neg = true;
  }
  return !(pos && neg);
};
const inDisc = (px, py, cx, cy, r) => (px - cx) ** 2 + (py - cy) ** 2 <= r * r;
const inRoundRect = (px, py, x0, y0, w, h, r) => {
  const x1 = x0 + w, y1 = y0 + h; r = Math.min(r, w / 2, h / 2);
  if (px >= x0 + r && px <= x1 - r) return py >= y0 && py <= y1;
  if (py >= y0 + r && py <= y1 - r) return px >= x0 && px <= x1;
  const cx = Math.min(Math.max(px, x0 + r), x1 - r);
  const cy = Math.min(Math.max(py, y0 + r), y1 - r);
  return (px - cx) ** 2 + (py - cy) ** 2 <= r * r;
};

// ---- palette ----
const TILE = [0x20, 0x26, 0x2f];   // dark slate tile
const BLUE = [0x4f, 0x9a, 0xe6];   // remaining (brand blue, brightened)
const EMPTY = [0x3a, 0x44, 0x52];  // drained (muted slate, visible on dark)
const LIGHT = [0x9a, 0xa6, 0xb6];  // glass caps / accents
const SCREEN = [0x2d, 0x35, 0x40]; // inner "screen"

// tile background (opaque). transparent variants skip this.
function tile(c) {
  const N = c.size, pad = Math.round(N * 0.06);
  paint(c, (px, py) => inRoundRect(px, py, pad, pad, N - 2 * pad, N - 2 * pad, N * 0.22), TILE);
}

// For transparent glyphs we render "empty" as a faint tint of blue so the
// two-tone (remaining vs drained) survives on ANY background.
function emptyColor(transparent) { return transparent ? BLUE : EMPTY; }
function emptyAlpha(transparent) { return transparent ? 75 : 255; }

// ---- A: hourglass ----
function conceptA(size, transparent = false) {
  const c = canvas(size), N = size, P = (u) => u * N;
  if (!transparent) tile(c);
  const topTri = [[P(0.30), P(0.235)], [P(0.70), P(0.235)], [P(0.50), P(0.50)]];
  const botTri = [[P(0.30), P(0.765)], [P(0.70), P(0.765)], [P(0.50), P(0.50)]];
  const mound = [[P(0.415), P(0.765)], [P(0.585), P(0.765)], [P(0.50), P(0.665)]];
  paint(c, (x, y) => inPoly(x, y, botTri), emptyColor(transparent), emptyAlpha(transparent)); // drained chamber
  paint(c, (x, y) => inPoly(x, y, topTri), BLUE);  // remaining sand (top)
  paint(c, (x, y) => inPoly(x, y, mound), BLUE);   // fallen sand (bottom mound)
  // wooden caps top & bottom
  paint(c, (x, y) => inRoundRect(x, y, P(0.26), P(0.185), P(0.48), P(0.05), P(0.025)), LIGHT);
  paint(c, (x, y) => inRoundRect(x, y, P(0.26), P(0.765), P(0.48), P(0.05), P(0.025)), LIGHT);
  return c;
}

// ---- B: hybrid (bar × hourglass) ----
function conceptB(size, transparent = false) {
  const c = canvas(size), N = size, P = (u) => u * N;
  if (!transparent) tile(c);
  const top = [[P(0.24), P(0.22)], [P(0.76), P(0.22)], [P(0.565), P(0.50)], [P(0.435), P(0.50)]];
  const bot = [[P(0.435), P(0.50)], [P(0.565), P(0.50)], [P(0.76), P(0.78)], [P(0.24), P(0.78)]];
  const slab = [[P(0.296), P(0.70)], [P(0.704), P(0.70)], [P(0.76), P(0.78)], [P(0.24), P(0.78)]];
  paint(c, (x, y) => inPoly(x, y, bot), emptyColor(transparent), emptyAlpha(transparent));
  paint(c, (x, y) => inPoly(x, y, top), BLUE);
  paint(c, (x, y) => inPoly(x, y, slab), BLUE);
  return c;
}

// ---- C: edge-bar on a screen ----
function conceptC(size, transparent = false) {
  const c = canvas(size), N = size, P = (u) => u * N;
  if (!transparent) tile(c);
  // screen (slightly narrower so the edge bar gets room)
  paint(c, (x, y) => inRoundRect(x, y, P(0.14), P(0.18), P(0.56), P(0.64), P(0.06)), LIGHT, transparent ? 140 : 255);
  paint(c, (x, y) => inRoundRect(x, y, P(0.155), P(0.195), P(0.53), P(0.61), P(0.05)), transparent ? TILE : SCREEN, transparent ? 0 : 255);
  // right-edge ambient bar (thicker for small-size legibility)
  const bw = P(0.13), bx = P(0.86) - bw, by = P(0.2), bh = P(0.6), r = bw / 2;
  paint(c, (x, y) => inRoundRect(x, y, bx, by, bw, bh, r), emptyColor(transparent), emptyAlpha(transparent));
  const fillH = bh * 0.62;
  paint(c, (x, y) => inRoundRect(x, y, bx, by, bw, fillH, r), BLUE);
  return c;
}

// ---- D: sun descending the day's arc ----
function conceptD(size, transparent = false) {
  const c = canvas(size), N = size, P = (u) => u * N;
  if (!transparent) tile(c);
  const cx = P(0.5), cy = P(0.72), R = P(0.40), t = P(0.085);
  const rO = R + t / 2, rI = R - t / 2;
  const frac = 0.62, edge = Math.PI * (1 - frac);
  const onArc = (px, py) => {
    const d = Math.hypot(px - cx, py - cy);
    if (d < rI || d > rO) return false;
    const ang = Math.atan2(cy - py, px - cx); // math angle (y up)
    return ang >= 0 && ang <= Math.PI;
  };
  paint(c, (px, py) => onArc(px, py) && Math.atan2(cy - py, px - cx) < edge, emptyColor(transparent), emptyAlpha(transparent));
  paint(c, (px, py) => onArc(px, py) && Math.atan2(cy - py, px - cx) >= edge, BLUE);
  // sun at the boundary
  const sx = cx + R * Math.cos(edge), sy = cy - R * Math.sin(edge);
  paint(c, (px, py) => inDisc(px, py, sx, sy, P(0.085)), BLUE);
  paint(c, (px, py) => inDisc(px, py, sx, sy, P(0.04)), LIGHT);
  return c;
}

const CONCEPTS = { A: conceptA, B: conceptB, C: conceptC, D: conceptD };

// ---- write individual files ----
fs.mkdirSync(outDir, { recursive: true });
const written = [];
for (const [key, fn] of Object.entries(CONCEPTS)) {
  for (const s of [512, 32, 16]) {
    const name = `${key}-tile-${s}.png`;
    fs.writeFileSync(path.join(outDir, name), encodePng(s, s, fn(s, false).px));
    written.push(name);
  }
  for (const s of [512, 16]) {
    const name = `${key}-glyph-${s}.png`;
    fs.writeFileSync(path.join(outDir, name), encodePng(s, s, fn(s, true).px));
    written.push(name);
  }
}

// ---- contact sheet: rows = concepts, cols = tile@128/48/32/16 + glyph@40 on white & black ----
function contactSheet() {
  const rows = Object.keys(CONCEPTS);
  const margin = 18, gap = 22, big = 128, rowH = big + 26;
  const xs = { t128: margin };
  xs.t48 = xs.t128 + big + gap;
  xs.t32 = xs.t48 + 48 + gap;
  xs.t16 = xs.t32 + 32 + gap;
  xs.gW = xs.t16 + 16 + gap + 8;
  xs.gB = xs.gW + 56 + gap;
  const W = xs.gB + 56 + margin;
  const H = margin + rows.length * rowH;
  const sheet = canvasWH(W, H);
  rect(sheet, 0, 0, W, H, [0x12, 0x14, 0x18]); // neutral dark sheet bg
  rows.forEach((key, i) => {
    const fn = CONCEPTS[key];
    const y = margin + i * rowH;
    const center = (s) => y + Math.round((big - s) / 2);
    blit(sheet, fn(big, false), xs.t128, center(big));
    blit(sheet, fn(48, false), xs.t48, center(48));
    blit(sheet, fn(32, false), xs.t32, center(32));
    blit(sheet, fn(16, false), xs.t16, center(16));
    // glyph (transparent) over white and black swatches → favicon test
    const gw = 56, gy = y + Math.round((big - gw) / 2), g = 40, gpad = (gw - g) / 2;
    rect(sheet, xs.gW, gy, gw, gw, [0xff, 0xff, 0xff]);
    rect(sheet, xs.gB, gy, gw, gw, [0x00, 0x00, 0x00]);
    blit(sheet, fn(g, true), xs.gW + gpad, gy + gpad);
    blit(sheet, fn(g, true), xs.gB + gpad, gy + gpad);
  });
  fs.writeFileSync(path.join(outDir, '_contact-sheet.png'), encodePngOf(sheet));
  return '_contact-sheet.png';
}
written.push(contactSheet());
for (const f of written) console.log('wrote', path.join('assets/candidates', f));
