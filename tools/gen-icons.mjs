// Generates tray + app icons with zero dependencies: a tiny PNG encoder
// (zlib deflate via node:zlib) plus an anti-aliased painter.
// Run: npm run icons  → writes into ../assets
//
// The mark is DayGlassBar's identity, not an explainer: a calm sliver of light
// at the edge of a dark "screen" field (cool blue, brand-adjacent). The sliver's
// lower part is denser and the upper part fades — mirroring the app, where the
// fill drains downward so the remaining time collects at the bottom (docs/design.md).
// The tray/template reduce to a simplified centred sliver glyph (the meter nuance
// cannot survive at 16px / monochrome — that is expected, see docs/design.md).
import zlib from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const assets = path.join(here, '..', 'assets');

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
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function encodePng(width, height, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter type 0 (none)
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---- drawing ----
function canvas(size) {
  return { size, px: Buffer.alloc(size * size * 4) };
}

function setPx(c, x, y, [r, g, b], a) {
  if (x < 0 || y < 0 || x >= c.size || y >= c.size || a <= 0) return;
  const i = (y * c.size + x) * 4;
  const sa = a / 255;
  const da = c.px[i + 3] / 255;
  const oa = sa + da * (1 - sa);
  if (oa <= 0) return;
  for (let k = 0; k < 3; k++) {
    const sc = [r, g, b][k];
    const dc = c.px[i + k];
    c.px[i + k] = Math.round((sc * sa + dc * da * (1 - sa)) / oa);
  }
  c.px[i + 3] = Math.round(oa * 255);
}

// Axis-aligned rounded-rect inside test (used for the field tile + glyph capsule).
function inRR(px, py, x0, y0, w, h, r) {
  const x1 = x0 + w, y1 = y0 + h;
  r = Math.min(r, w / 2, h / 2);
  if (px >= x0 + r && px <= x1 - r) return py >= y0 && py <= y1;
  if (py >= y0 + r && py <= y1 - r) return px >= x0 && px <= x1;
  const cx = Math.min(Math.max(px, x0 + r), x1 - r);
  const cy = Math.min(Math.max(py, y0 + r), y1 - r);
  return (px - cx) ** 2 + (py - cy) ** 2 <= r * r;
}

// 3×3 supersampled coverage of an inside() predicate → crisp anti-aliasing.
function coverage(px, py, inside) {
  let hit = 0;
  for (let sy = 0; sy < 3; sy++)
    for (let sx = 0; sx < 3; sx++)
      if (inside(px + (sx + 0.5) / 3 - 0.5, py + (sy + 0.5) / 3 - 0.5)) hit++;
  return hit / 9;
}

const clamp01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t);
const gauss = (d, s) => Math.exp(-(d * d) / (2 * s * s));
const flo = (N, rel, min) => Math.max(N * rel, min); // size-aware: relative px with an absolute floor
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };

const TILE = [0x18, 0x1d, 0x25]; // calm dark "screen" field
const COOL = [0x7c, 0xc0, 0xff]; // quiet cool light (brand-adjacent blue)

const field = (N) => (px, py) => inRR(px, py, N * 0.05, N * 0.05, N * 0.9, N * 0.9, N * 0.22);

// Glow of the edge sliver (bright core hugging the right edge, blooming inward).
function sliver(px, py, N) {
  const lx = N * 0.8, cs = flo(N, 0.035, 1.1), core = gauss(px - lx, cs), d = lx - px;
  const bloom = d > 0 ? 0.5 * gauss(d, flo(N, 0.16, 3)) : 0.5 * gauss(px - lx, cs * 1.2);
  return clamp01((core + bloom) * (N <= 48 ? 1.15 : 1));
}
// Meter along the sliver: faint at the top (elapsed), dense at the bottom
// (remaining) — the app drains downward, so density collects below.
const meter = (py, N) => 0.18 + 0.82 * smooth(0.34, 0.4, clamp01((py - N * 0.2) / (N * 0.6)));

// App icon: dark rounded field with the cool edge-sliver draining downward.
function appIcon(size) {
  const c = canvas(size), inField = field(size);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const fc = coverage(x + 0.5, y + 0.5, inField);
      if (!fc) continue;
      setPx(c, x, y, TILE, Math.round(255 * fc));
      const v = sliver(x + 0.5, y + 0.5, size) * meter(y + 0.5, size);
      if (v > 0) setPx(c, x, y, COOL, Math.round(255 * v * fc));
    }
  return c;
}

// Tray/template glyph: a simplified centred sliver (a lone edge-bar reads oddly
// standalone, and the meter nuance can't survive this scale).
function trayGlyph(size, ink, withGlow) {
  const c = canvas(size);
  const hw = flo(size, 0.07, 2), lx = size * 0.5, y0 = size * 0.18, h = size * 0.64;
  const capsule = (px, py) => inRR(px, py, lx - hw, y0, hw * 2, h, hw);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      let a = coverage(x + 0.5, y + 0.5, capsule);
      if (withGlow && y + 0.5 > y0 && y + 0.5 < y0 + h)
        a = Math.max(a, 0.4 * gauss(x + 0.5 - lx, hw * 1.6));
      if (a > 0) setPx(c, x, y, ink, Math.round(255 * a));
    }
  return c;
}

function write(name, c) {
  const out = path.join(assets, name);
  fs.writeFileSync(out, encodePng(c.size, c.size, c.px));
  return out;
}

fs.mkdirSync(assets, { recursive: true });
const written = [
  write('icon.png', appIcon(512)),
  write('tray.png', trayGlyph(32, COOL, true)),         // color (e.g. Windows)
  write('trayTemplate.png', trayGlyph(16, [0, 0, 0], false)),   // macOS template (black + alpha)
  write('trayTemplate@2x.png', trayGlyph(32, [0, 0, 0], false)),
];
for (const f of written) console.log('wrote', path.relative(path.join(here, '..'), f));
