// Chosen mark = v3 (meter), FLIPPED to match real app behaviour: as time
// passes the fill drains so density collects at the BOTTOM (top faint = elapsed,
// bottom dense = remaining). Cool blue, edge-sliver on a calm field.
// Renders a before/after + full size set + tray/template, to confirm orientation
// before wiring into the production tools/gen-icons.mjs. → assets/marks/final
//   node tools/gen-icon-final.mjs
import zlib from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(here, '..', 'assets', 'marks', 'final');

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
const span = (py, N) => clamp01((py - N * 0.2) / (N * 0.6)); // 0 top → 1 bottom
// OLD v3: dense at top.  NEW v3r: dense at BOTTOM (matches the app draining downward).
const meterOld = (py, N) => 1 - 0.82 * smooth(0.6, 0.66, span(py, N));
const meterNew = (py, N) => 0.18 + 0.82 * smooth(0.34, 0.4, span(py, N));

function appIcon(size, meter) {
  const c = canvas(size), fc = fieldFn(size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const fcov = cov(x + 0.5, y + 0.5, fc); if (!fcov) continue;
    setPx(c, x, y, TILE, Math.round(255 * fcov));
    const v = sliver(x + 0.5, y + 0.5, size) * meter(y + 0.5, size);
    if (v > 0) setPx(c, x, y, COOL, Math.round(255 * v * fcov));
  }
  return c;
}
// tray / template: a simplified CENTRED sliver glyph on transparency (a lone
// edge-bar reads oddly standalone; the meter nuance can't survive this scale).
function trayGlyph(size, ink, glow) {
  const c = canvas(size), hw = flo(size, 0.07, 2), lx = size * 0.5, y0 = size * 0.18, h = size * 0.64;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const cap = cov(x + 0.5, y + 0.5, (qx, qy) => inRR(qx, qy, lx - hw, y0, hw * 2, h, hw));
    let a = cap;
    if (glow) a = Math.max(a, 0.4 * gauss(x + 0.5 - lx, hw * 1.6) * (y + 0.5 > y0 && y + 0.5 < y0 + h ? 1 : 0));
    if (a > 0) setPx(c, x, y, ink, Math.round(255 * a));
  }
  return c;
}

fs.mkdirSync(outDir, { recursive: true });
const written = [];
// app icon, full size set (NEW orientation)
for (const s of [512, 256, 128, 64, 48, 32, 16]) { const n = `icon-${s}.png`; fs.writeFileSync(path.join(outDir, n), encodeOf(appIcon(s, meterNew))); written.push(n); }
// tray + template
fs.writeFileSync(path.join(outDir, 'tray-32.png'), encodeOf(trayGlyph(32, COOL, true))); written.push('tray-32.png');
fs.writeFileSync(path.join(outDir, 'template-16.png'), encodeOf(trayGlyph(16, [0, 0, 0], false))); written.push('template-16.png');
fs.writeFileSync(path.join(outDir, 'template-32.png'), encodeOf(trayGlyph(32, [0, 0, 0], false))); written.push('template-32.png');

// before/after sheet
function sheet() {
  const m = 18, gap = 22, big = 220;
  const labels = [['OLD (上が濃い)', meterOld], ['NEW (下が濃い)', meterNew]];
  const sizes = [128, 64, 32, 16];
  const W = m + big + gap + big + gap + sizes.reduce((a, s) => a + s + gap, 0) + m, H = m + big + m;
  const S = canvasWH(W, big + 2 * m); rect(S, 0, 0, W, big + 2 * m, [0x10, 0x12, 0x16]);
  // OLD and NEW at big
  blit(S, appIcon(big, meterOld), m, m);
  blit(S, appIcon(big, meterNew), m + big + gap, m);
  // NEW at smaller sizes
  let x = m + 2 * (big + gap);
  for (const s of sizes) { blit(S, appIcon(s, meterNew), x, m + Math.round((big - s) / 2)); x += s + gap; }
  fs.writeFileSync(path.join(outDir, '_final-sheet.png'), encodeOf(S));
  return '_final-sheet.png';
}
written.push(sheet());
for (const f of written) console.log('wrote', path.join('assets/marks/final', f));
