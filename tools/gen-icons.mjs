// Generates tray + app icons with zero dependencies: a tiny PNG encoder
// (zlib deflate via node:zlib) plus an anti-aliased rounded-rect painter.
// Run: npm run icons  → writes into ../assets
//
// These are deliberately simple placeholders that match the bar motif (a slate
// track with a blue "fill"); replace assets/icon.png before shipping if desired
// (docs/design.md, known limitation).
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
  const typeBuf = Buffer.from(type, 'ascii');
  const body = Buffer.concat([typeBuf, data]);
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
  // 10,11,12 = compression / filter / interlace = 0
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

// Signed-distance coverage for an axis-aligned rounded rect → crisp anti-aliasing.
function roundRect(c, x0, y0, w, h, radius, color, alpha = 255, samples = 3) {
  const x1 = x0 + w;
  const y1 = y0 + h;
  const r = Math.min(radius, w / 2, h / 2);
  const inside = (px, py) => {
    const cx = Math.min(Math.max(px, x0 + r), x1 - r);
    const cy = Math.min(Math.max(py, y0 + r), y1 - r);
    const dx = px - cx;
    const dy = py - cy;
    if (px >= x0 + r && px <= x1 - r) return py >= y0 && py <= y1;
    if (py >= y0 + r && py <= y1 - r) return px >= x0 && px <= x1;
    return dx * dx + dy * dy <= r * r;
  };
  const minX = Math.max(0, Math.floor(x0));
  const maxX = Math.min(c.size - 1, Math.ceil(x1));
  const minY = Math.max(0, Math.floor(y0));
  const maxY = Math.min(c.size - 1, Math.ceil(y1));
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      let hit = 0;
      for (let sy = 0; sy < samples; sy++) {
        for (let sx = 0; sx < samples; sx++) {
          const px = x + (sx + 0.5) / samples;
          const py = y + (sy + 0.5) / samples;
          if (inside(px, py)) hit++;
        }
      }
      if (hit) setPx(c, x, y, color, Math.round((alpha * hit) / (samples * samples)));
    }
  }
}

const SLATE = [0x2b, 0x30, 0x38];
const TRACK = [0x3a, 0x40, 0x4b];
const BLUE = [0x4a, 0x90, 0xd9];

// App icon: rounded slate tile, a track inset, and a blue fill draining ~62%.
function appIcon(size) {
  const c = canvas(size);
  const pad = Math.round(size * 0.16);
  roundRect(c, pad, pad, size - 2 * pad, size - 2 * pad, size * 0.18, SLATE);
  const barH = Math.round(size * 0.12);
  const barY = Math.round(size / 2 - barH / 2);
  const barX = Math.round(size * 0.26);
  const barW = size - 2 * barX;
  const radius = barH / 2;
  roundRect(c, barX, barY, barW, barH, radius, TRACK);
  roundRect(c, barX, barY, Math.round(barW * 0.62), barH, radius, BLUE);
  return c;
}

// Tray (color, e.g. Windows): small rounded blue bar on transparency.
function trayColor(size) {
  const c = canvas(size);
  const h = Math.max(2, Math.round(size * 0.28));
  const y = Math.round(size / 2 - h / 2);
  const x = Math.round(size * 0.16);
  const w = size - 2 * x;
  roundRect(c, x, y, w, h, h / 2, TRACK, 150);
  roundRect(c, x, y, Math.round(w * 0.62), h, h / 2, BLUE);
  return c;
}

// Tray template (macOS): black + alpha only; the OS recolors it.
function trayTemplate(size) {
  const c = canvas(size);
  const h = Math.max(2, Math.round(size * 0.28));
  const y = Math.round(size / 2 - h / 2);
  const x = Math.round(size * 0.16);
  const w = size - 2 * x;
  const BLACK = [0, 0, 0];
  roundRect(c, x, y, w, h, h / 2, BLACK, 90); // track portion, faint
  roundRect(c, x, y, Math.round(w * 0.62), h, h / 2, BLACK, 255); // fill portion, solid
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
  write('tray.png', trayColor(32)),
  write('trayTemplate.png', trayTemplate(16)),
  write('trayTemplate@2x.png', trayTemplate(32)),
];
for (const f of written) console.log('wrote', path.relative(path.join(here, '..'), f));
