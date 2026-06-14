// Icon MARK exploration under the agreed brief:
//   communicate the PERSONALITY ("a calm sliver of light at the screen's edge,
//   never demanding attention"), NOT the mechanic. Avoid clock/hourglass/
//   progress/toggle. Must survive at 16px and as a monochrome tray glyph.
// Non-destructive: writes only into ../assets/marks. Run:
//   node tools/gen-icon-marks.mjs
import zlib from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(here, '..', 'assets', 'marks');

// ---- PNG encoder ----
function crc32(buf) { let c = ~0; for (let i = 0; i < buf.length; i++) { c ^= buf[i]; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); } return ~c >>> 0; }
function chunk(type, data) { const body = Buffer.concat([Buffer.from(type, 'ascii'), data]); const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body), 0); return Buffer.concat([len, body, crc]); }
function encodePng(w, h, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  const stride = w * 4, raw = Buffer.alloc((stride + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (stride + 1)] = 0; rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride); }
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
const encodeOf = (c) => encodePng(c.w, c.h, c.px);

// ---- canvas ----
function canvas(size) { return { size, w: size, h: size, px: Buffer.alloc(size * size * 4) }; }
function canvasWH(w, h) { return { size: w, w, h, px: Buffer.alloc(w * h * 4) }; }
function setPx(c, x, y, [r, g, b], a) {
  if (x < 0 || y < 0 || x >= c.w || y >= c.h || a <= 0) return;
  const i = (y * c.w + x) * 4, sa = a / 255, da = c.px[i + 3] / 255, oa = sa + da * (1 - sa);
  if (oa <= 0) return;
  for (let k = 0; k < 3; k++) { const sc = [r, g, b][k]; c.px[i + k] = Math.round((sc * sa + c.px[i + k] * da * (1 - sa)) / oa); }
  c.px[i + 3] = Math.round(oa * 255);
}
function rect(c, x0, y0, w, h, color) { for (let y = Math.max(0, y0); y < Math.min(c.h, y0 + h); y++) for (let x = Math.max(0, x0); x < Math.min(c.w, x0 + w); x++) setPx(c, x, y, color, 255); }
function blit(dst, src, ox, oy) { for (let y = 0; y < src.h; y++) for (let x = 0; x < src.w; x++) { const i = (y * src.w + x) * 4; setPx(dst, ox + x, oy + y, [src.px[i], src.px[i + 1], src.px[i + 2]], src.px[i + 3]); } }

// rounded-square "field" coverage (anti-aliased), the calm screen of attention.
function inRR(px, py, x0, y0, w, h, r) {
  const x1 = x0 + w, y1 = y0 + h; r = Math.min(r, w / 2, h / 2);
  if (px >= x0 + r && px <= x1 - r) return py >= y0 && py <= y1;
  if (py >= y0 + r && py <= y1 - r) return px >= x0 && px <= x1;
  const cx = Math.min(Math.max(px, x0 + r), x1 - r), cy = Math.min(Math.max(py, y0 + r), y1 - r);
  return (px - cx) ** 2 + (py - cy) ** 2 <= r * r;
}
function fieldCov(px, py, N) {
  const pad = N * 0.05, r = N * 0.22; let hit = 0;
  for (let sy = 0; sy < 3; sy++) for (let sx = 0; sx < 3; sx++)
    if (inRR(px + (sx + 0.5) / 3 - 0.5, py + (sy + 0.5) / 3 - 0.5, pad, pad, N - 2 * pad, N - 2 * pad, r)) hit++;
  return hit / 9;
}

// ---- palette ----
const TILE = [0x18, 0x1d, 0x25];     // calm dark field
const COOL = [0x7c, 0xc0, 0xff];     // quiet cool light (brand-adjacent)
const WARM = [0xff, 0xcb, 0x82];     // "day" warmth variant
const clamp01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t);
const gauss = (d, s) => Math.exp(-(d * d) / (2 * s * s));

// ---- intensity fields (0..1) ; px,py center-sampled, N=size ----
// M1 edge-glow: light hugging the right edge, fading inward → calm field, lit margin.
const M1 = (px, py, N) => {
  const edge = N * 0.86, gw = N * 0.5;
  return Math.pow(clamp01((px - (edge - gw)) / gw), 2.0);
};
// M2 sliver of daylight: a single soft slit of light off to one side.
const M2 = (px, py, N) => {
  const lx = N * 0.7, s = N * 0.045;
  return clamp01(gauss(px - lx, s) + 0.32 * gauss(px - lx, s * 3.2));
};
// M3 luminous margin: a soft glowing frame inset from the edge (bezel-of-light).
const M3 = (px, py, N) => {
  const x0 = N * 0.2, x1 = N * 0.8, y0 = N * 0.2, y1 = N * 0.8, s = N * 0.045;
  const qx = Math.max(x0 - px, 0, px - x1), qy = Math.max(y0 - py, 0, py - y1);
  const outside = Math.hypot(qx, qy);
  const insideD = (px > x0 && px < x1 && py > y0 && py < y1) ? Math.min(px - x0, x1 - px, py - y0, y1 - py) : 0;
  return gauss(outside > 0 ? outside : insideD, s);
};
// M4 corner dawn: light pooling at one corner, fading across the field (asymmetric calm).
const M4 = (px, py, N) => {
  const cx = N * 0.84, cy = N * 0.78, R = N * 0.62;
  return Math.pow(clamp01(1 - Math.hypot(px - cx, py - cy) / R), 1.8);
};
// M5 synthesis: a sliver of light ON the edge, blooming softly inward.
// = M1's edge-honesty (the app literally lives on the right edge) fused with
//   M2's ownable, poetic "single quiet sliver of light".
const M5 = (px, py, N) => {
  const lx = N * 0.8, core = gauss(px - lx, N * 0.04);
  const d = lx - px; // distance inward (to the left of the sliver)
  const bloom = d > 0 ? 0.5 * gauss(d, N * 0.17) : 0.5 * gauss(px - lx, N * 0.05);
  return clamp01(core + bloom);
};
const MARKS = { M1, M2, M3, M4, M5 };

// ---- render one mark ----
// mode: 'tile' (dark field + colored glow) | 'black' | 'white' (mono glyph, clipped to field)
function render(intensity, size, mode, glow = COOL) {
  const c = canvas(size), N = size;
  const ink = mode === 'black' ? [0, 0, 0] : mode === 'white' ? [255, 255, 255] : glow;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const cov = fieldCov(x + 0.5, y + 0.5, N);
    if (!cov) continue;
    if (mode === 'tile') setPx(c, x, y, TILE, Math.round(255 * cov));
    const inten = intensity(x + 0.5, y + 0.5, N);
    if (inten > 0) setPx(c, x, y, ink, Math.round(255 * inten * cov));
  }
  return c;
}

// ---- write individual files ----
fs.mkdirSync(outDir, { recursive: true });
const written = [];
for (const [key, fn] of Object.entries(MARKS)) {
  for (const s of [512, 32, 16]) { const n = `${key}-${s}.png`; fs.writeFileSync(path.join(outDir, n), encodeOf(render(fn, s, 'tile'))); written.push(n); }
  fs.writeFileSync(path.join(outDir, `${key}-mono-32.png`), encodeOf(render(fn, 32, 'black'))); written.push(`${key}-mono-32.png`);
}

// ---- contact sheet: rows = marks; cols = tile128 / tile32 / tile16 / warm128 / mono(black on light) / mono(white on dark) ----
function sheet() {
  const rows = Object.keys(MARKS), m = 18, gap = 22, big = 128, rowH = big + 26;
  const x = { a: m }; x.b = x.a + big + gap; x.c = x.b + 32 + gap; x.d = x.c + 16 + gap + 8;
  x.e = x.d + big + gap; x.f = x.e + 60 + gap; x.g = x.f + 60 + gap;
  const W = x.g + 60 + m, H = m + rows.length * rowH, S = canvasWH(W, H);
  rect(S, 0, 0, W, H, [0x10, 0x12, 0x16]);
  rows.forEach((k, i) => {
    const fn = MARKS[k], y = m + i * rowH, ctr = (s) => y + Math.round((big - s) / 2);
    blit(S, render(fn, big, 'tile'), x.a, ctr(big));         // color @128
    blit(S, render(fn, 32, 'tile'), x.b, ctr(32));           // @32
    blit(S, render(fn, 16, 'tile'), x.c, ctr(16));           // @16
    blit(S, render(fn, big, 'tile', WARM), x.d, ctr(big));   // warm "day" variant @128
    const sw = 60, sy = y + Math.round((big - sw) / 2), g = 44, gp = (sw - g) / 2;
    rect(S, x.e, sy, sw, sw, [0xf2, 0xf2, 0xf2]); blit(S, render(fn, g, 'black'), x.e + gp, sy + gp); // mono on light
    rect(S, x.f, sy, sw, sw, [0x1c, 0x1c, 0x1c]); blit(S, render(fn, g, 'white'), x.f + gp, sy + gp); // mono on dark
    rect(S, x.g, sy, sw, sw, [0x2a, 0x6d, 0xc0]); blit(S, render(fn, g, 'white'), x.g + gp, sy + gp); // on a colored bg
  });
  fs.writeFileSync(path.join(outDir, '_marks-sheet.png'), encodeOf(S));
  return '_marks-sheet.png';
}
written.push(sheet());
for (const f of written) console.log('wrote', path.join('assets/marks', f));
