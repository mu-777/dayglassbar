// Finalist icon marks, production-quality, COOL blue, for side-by-side judging.
// Three directions from the agreed brief ("a calm sliver of light at the edge"):
//   m5 sliver-on-edge (recommended) · m3 luminous frame · m2 centred sliver
// Each is rendered size-aware (an absolute px floor keeps thin glows from washing
// out at 16px) plus a crisp monochrome derivative for the tray template.
// Non-destructive: writes into ../assets/marks/finalists only.
//   node tools/gen-icon-finalists.mjs
import zlib from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(here, '..', 'assets', 'marks', 'finalists');

// ---- PNG ----
function crc32(b) { let c = ~0; for (let i = 0; i < b.length; i++) { c ^= b[i]; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); } return ~c >>> 0; }
function chunk(t, d) { const body = Buffer.concat([Buffer.from(t, 'ascii'), d]); const L = Buffer.alloc(4); L.writeUInt32BE(d.length, 0); const C = Buffer.alloc(4); C.writeUInt32BE(crc32(body), 0); return Buffer.concat([L, body, C]); }
function encodePng(w, h, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]); const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  const stride = w * 4, raw = Buffer.alloc((stride + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (stride + 1)] = 0; rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride); }
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
const encodeOf = (c) => encodePng(c.w, c.h, c.px);

// ---- canvas ----
function canvas(s) { return { size: s, w: s, h: s, px: Buffer.alloc(s * s * 4) }; }
function canvasWH(w, h) { return { size: w, w, h, px: Buffer.alloc(w * h * 4) }; }
function setPx(c, x, y, [r, g, b], a) {
  if (x < 0 || y < 0 || x >= c.w || y >= c.h || a <= 0) return;
  const i = (y * c.w + x) * 4, sa = a / 255, da = c.px[i + 3] / 255, oa = sa + da * (1 - sa); if (oa <= 0) return;
  for (let k = 0; k < 3; k++) c.px[i + k] = Math.round(([r, g, b][k] * sa + c.px[i + k] * da * (1 - sa)) / oa);
  c.px[i + 3] = Math.round(oa * 255);
}
function rect(c, x0, y0, w, h, col) { for (let y = Math.max(0, y0); y < Math.min(c.h, y0 + h); y++) for (let x = Math.max(0, x0); x < Math.min(c.w, x0 + w); x++) setPx(c, x, y, col, 255); }
function blit(d, s, ox, oy) { for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) { const i = (y * s.w + x) * 4; setPx(d, ox + x, oy + y, [s.px[i], s.px[i + 1], s.px[i + 2]], s.px[i + 3]); } }

// rounded-rect inside test + field coverage
function inRR(px, py, x0, y0, w, h, r) {
  const x1 = x0 + w, y1 = y0 + h; r = Math.min(r, w / 2, h / 2);
  if (px >= x0 + r && px <= x1 - r) return py >= y0 && py <= y1;
  if (py >= y0 + r && py <= y1 - r) return px >= x0 && px <= x1;
  const cx = Math.min(Math.max(px, x0 + r), x1 - r), cy = Math.min(Math.max(py, y0 + r), y1 - r);
  return (px - cx) ** 2 + (py - cy) ** 2 <= r * r;
}
function cov(px, py, fn) { let h = 0; for (let sy = 0; sy < 3; sy++) for (let sx = 0; sx < 3; sx++) if (fn(px + (sx + 0.5) / 3 - 0.5, py + (sy + 0.5) / 3 - 0.5)) h++; return h / 9; }
const fieldFn = (N) => (px, py) => inRR(px, py, N * 0.05, N * 0.05, N * 0.9, N * 0.9, N * 0.22);

const TILE = [0x18, 0x1d, 0x25], COOL = [0x7c, 0xc0, 0xff];
const clamp01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t);
const gauss = (d, s) => Math.exp(-(d * d) / (2 * s * s));
const flo = (N, rel, min) => Math.max(N * rel, min); // size-aware: relative with absolute px floor

// ---- glow intensity fields (0..1), size-aware ----
const FIELDS = {
  m5: (px, py, N) => { // sliver on the right edge, blooming inward
    const lx = N * 0.8, cs = flo(N, 0.035, 1.1), core = gauss(px - lx, cs), d = lx - px;
    const bloom = d > 0 ? 0.5 * gauss(d, flo(N, 0.16, 3)) : 0.5 * gauss(px - lx, cs * 1.2);
    return clamp01((core + bloom) * (N <= 48 ? 1.15 : 1));
  },
  m3: (px, py, N) => { // luminous frame
    const x0 = N * 0.2, x1 = N * 0.8, y0 = N * 0.2, y1 = N * 0.8, s = flo(N, 0.04, 1.2);
    const qx = Math.max(x0 - px, 0, px - x1), qy = Math.max(y0 - py, 0, py - y1), out = Math.hypot(qx, qy);
    const ins = (px > x0 && px < x1 && py > y0 && py < y1) ? Math.min(px - x0, x1 - px, py - y0, y1 - py) : 0;
    return clamp01(gauss(out > 0 ? out : ins, s) * (N <= 48 ? 1.2 : 1));
  },
  m2: (px, py, N) => { // centred sliver
    const lx = N * 0.7, cs = flo(N, 0.035, 1.1);
    return clamp01((gauss(px - lx, cs) + 0.3 * gauss(px - lx, flo(N, 0.11, 3))) * (N <= 48 ? 1.15 : 1));
  },
};

// ---- crisp monochrome derivative for the tray template ----
function monoGlyph(kind, N, ink) {
  const c = canvas(N), fc = fieldFn(N);
  const paint = (inside) => { for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const fcov = cov(x + 0.5, y + 0.5, fc); if (!fcov) continue; const a = cov(x + 0.5, y + 0.5, inside); if (a) setPx(c, x, y, ink, Math.round(255 * a * fcov)); } };
  if (kind === 'm3') {
    const t = flo(N, 0.075, 2), x0 = N * 0.2, y0 = N * 0.2, w = N * 0.6, h = N * 0.6;
    paint((px, py) => inRR(px, py, x0, y0, w, h, N * 0.12) && !inRR(px, py, x0 + t, y0 + t, w - 2 * t, h - 2 * t, N * 0.1));
  } else {
    const lx = kind === 'm5' ? N * 0.8 : N * 0.7, hw = flo(N, 0.035, 1.3);
    paint((px, py) => inRR(px, py, lx - hw, N * 0.2, hw * 2, N * 0.6, hw));
  }
  return c;
}

// ---- color app-icon render ----
function tileIcon(kind, N) {
  const c = canvas(N), fc = fieldFn(N), fn = FIELDS[kind];
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const fcov = cov(x + 0.5, y + 0.5, fc); if (!fcov) continue;
    setPx(c, x, y, TILE, Math.round(255 * fcov));
    const v = fn(x + 0.5, y + 0.5, N); if (v > 0) setPx(c, x, y, COOL, Math.round(255 * v * fcov));
  }
  return c;
}

// ---- write files ----
fs.mkdirSync(outDir, { recursive: true });
const written = [];
for (const kind of Object.keys(FIELDS)) {
  for (const s of [512, 256, 128, 64, 48, 32, 16]) { const n = `${kind}-${s}.png`; fs.writeFileSync(path.join(outDir, n), encodeOf(tileIcon(kind, s))); written.push(n); }
  for (const s of [32, 16]) { const n = `${kind}-mono-${s}.png`; fs.writeFileSync(path.join(outDir, n), encodeOf(monoGlyph(kind, s, [0, 0, 0]))); written.push(n); }
}

// ---- comparison sheet: rows m5/m3/m2 ; cols tile 128/64/48/32/16 + mono(dark-on-light) + mono(light-on-dark) ----
function sheet() {
  const rows = Object.keys(FIELDS), m = 18, gap = 20, big = 128, rowH = big + 26;
  const X = [m]; [128, 64, 48, 32, 16].forEach((s, i) => X.push(X[i] + (i === 0 ? big : [128, 64, 48, 32, 16][i - 1]) + gap));
  const xMonoL = X[5] + 16 + gap + 8, xMonoD = xMonoL + 60 + gap, W = xMonoD + 60 + m, H = m + rows.length * rowH;
  const S = canvasWH(W, H); rect(S, 0, 0, W, H, [0x10, 0x12, 0x16]);
  rows.forEach((k, i) => {
    const y = m + i * rowH, ctr = (s) => y + Math.round((big - s) / 2);
    [128, 64, 48, 32, 16].forEach((s, j) => blit(S, tileIcon(k, s), X[j], ctr(s)));
    const sw = 60, sy = y + Math.round((big - sw) / 2), g = 44, gp = (sw - g) / 2;
    rect(S, xMonoL, sy, sw, sw, [0xf2, 0xf2, 0xf2]); blit(S, monoGlyph(k, g, [0, 0, 0]), xMonoL + gp, sy + gp);
    rect(S, xMonoD, sy, sw, sw, [0x1c, 0x1c, 0x1c]); blit(S, monoGlyph(k, g, [0xff, 0xff, 0xff]), xMonoD + gp, sy + gp);
  });
  fs.writeFileSync(path.join(outDir, '_finalists-sheet.png'), encodeOf(S));
  return '_finalists-sheet.png';
}
written.push(sheet());
for (const f of written) console.log('wrote', path.join('assets/marks/finalists', f));
