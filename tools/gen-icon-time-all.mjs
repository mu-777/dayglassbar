// All "how much time" policies worked up to production quality, cool blue,
// on the m5 edge-sliver. Lets every direction be judged at real sizes + mono.
//   v0  none         — pure sliver (identity only)
//   v1  day-fade     — sliver fades along its length (passage of day, NOT a meter)
//   v2  day-arc      — sliver + faint day-path + a "now" node (explicit moment)
//   v2b bead         — a bright bead ON the sliver = the sun's position on the day-line
//   v3  meter        — sliver lit top ~62% (literal remaining → drifts to progress/toggle)
// Key truth surfaced: in mono/16px the time nuance disappears for ALL of them —
// the choice only changes the LARGE icon. Non-destructive → assets/marks/time-all.
//   node tools/gen-icon-time-all.mjs
import zlib from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(here, '..', 'assets', 'marks', 'time-all');

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
const flo = (N, rel, min) => Math.max(N * rel, min);
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };

function sliver(px, py, N) {
  const lx = N * 0.8, cs = flo(N, 0.035, 1.1), core = gauss(px - lx, cs), d = lx - px;
  const bloom = d > 0 ? 0.5 * gauss(d, flo(N, 0.16, 3)) : 0.5 * gauss(px - lx, cs * 1.2);
  return clamp01((core + bloom) * (N <= 48 ? 1.15 : 1));
}
const span = (py, N) => clamp01((py - N * 0.2) / (N * 0.6));
const LX = (N) => N * 0.8;

const VARIANTS = {
  v0: (px, py, N) => sliver(px, py, N),
  v1: (px, py, N) => sliver(px, py, N) * (1 - 0.7 * smooth(0, 1, span(py, N))),
  v2: (px, py, N) => {
    const s = sliver(px, py, N), cx = N * 0.5, cy = N * 0.96, R = N * 0.62, band = flo(N, 0.016, 1);
    const dist = Math.hypot(px - cx, py - cy), ang = Math.atan2(cy - py, px - cx);
    const arc = ang >= 0 && ang <= Math.PI ? 0.18 * gauss(dist - R, band) : 0;
    const na = Math.PI * 0.6, nx = cx + R * Math.cos(na), ny = cy - R * Math.sin(na);
    const node = gauss(Math.hypot(px - nx, py - ny), flo(N, 0.045, 2));
    return clamp01(Math.max(s * 0.9, arc, node));
  },
  v2b: (px, py, N) => {
    const s = sliver(px, py, N), by = N * 0.4;
    const bead = 1.05 * gauss(Math.hypot(px - LX(N), py - by), flo(N, 0.055, 2.2));
    return clamp01(Math.max(s, bead));
  },
  v3: (px, py, N) => sliver(px, py, N) * (1 - 0.82 * smooth(0.6, 0.66, span(py, N))),
};

function tile(kind, N) {
  const c = canvas(N), fc = fieldFn(N), fn = VARIANTS[kind];
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const fcov = cov(x + 0.5, y + 0.5, fc); if (!fcov) continue;
    setPx(c, x, y, TILE, Math.round(255 * fcov));
    const v = fn(x + 0.5, y + 0.5, N); if (v > 0) setPx(c, x, y, COOL, Math.round(255 * v * fcov));
  }
  return c;
}
// mono derivative: the crisp sliver (time nuance intentionally drops out at this scale)
function mono(kind, N, ink) {
  const c = canvas(N), fc = fieldFn(N), hw = flo(N, 0.035, 1.3);
  const bead = kind === 'v2b' || kind === 'v2';
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const fcov = cov(x + 0.5, y + 0.5, fc); if (!fcov) continue;
    let a = cov(x + 0.5, y + 0.5, (qx, qy) => inRR(qx, qy, LX(N) - hw, N * 0.2, hw * 2, N * 0.6, hw));
    if (bead) a = Math.max(a, cov(x + 0.5, y + 0.5, (qx, qy) => Math.hypot(qx - LX(N), qy - N * 0.4) <= hw * 1.9));
    if (a) setPx(c, x, y, ink, Math.round(255 * a * fcov));
  }
  return c;
}

fs.mkdirSync(outDir, { recursive: true });
const written = [];
for (const k of Object.keys(VARIANTS)) {
  for (const s of [512, 256, 128, 64, 48, 32, 16]) { const n = `${k}-${s}.png`; fs.writeFileSync(path.join(outDir, n), encodeOf(tile(k, s))); written.push(n); }
  for (const s of [32, 16]) { const n = `${k}-mono-${s}.png`; fs.writeFileSync(path.join(outDir, n), encodeOf(mono(k, s, [0, 0, 0]))); written.push(n); }
}

function sheet() {
  const rows = Object.keys(VARIANTS), m = 18, gap = 22, big = 180, rowH = big + 22;
  const cols = [big, 96, 64, 32, 16], X = [m]; cols.forEach((s, i) => { if (i) X.push(X[i - 1] + cols[i - 1] + gap); });
  const xML = X[X.length - 1] + cols[cols.length - 1] + gap + 8, xMD = xML + 56 + gap;
  const W = xMD + 56 + m, H = m + rows.length * rowH;
  const S = canvasWH(W, H); rect(S, 0, 0, W, H, [0x10, 0x12, 0x16]);
  rows.forEach((k, i) => {
    const y = m + i * rowH, ctr = (s) => y + Math.round((big - s) / 2);
    cols.forEach((s, j) => blit(S, tile(k, s), X[j], ctr(s)));
    const sw = 56, sy = y + Math.round((big - sw) / 2), g = 44, gp = (sw - g) / 2;
    rect(S, xML, sy, sw, sw, [0xf2, 0xf2, 0xf2]); blit(S, mono(k, g, [0, 0, 0]), xML + gp, sy + gp);
    rect(S, xMD, sy, sw, sw, [0x1c, 0x1c, 0x1c]); blit(S, mono(k, g, [0xff, 0xff, 0xff]), xMD + gp, sy + gp);
  });
  fs.writeFileSync(path.join(outDir, '_time-all-sheet.png'), encodeOf(S));
  return '_time-all-sheet.png';
}
written.push(sheet());
for (const f of written) console.log('wrote', path.join('assets/marks/time-all', f));
