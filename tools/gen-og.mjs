// Renders the OG / social card (1200x630 PNG) for the landing site and saves it
// to web/assets/og.png, which web/index.html's og:image points at.
//
// Same zero-extra-dependency approach as capture-bar.mjs: an Electron window
// loads an inline HTML card and capturePage() saves the PNG. The card reuses the
// landing page's theme (deep navy + one cool-blue accent) and the app's identity:
// a thin sliver of light at the right edge, denser toward the bottom (remaining
// time collects below as the day drains).
//
//   npm run og            # -> web/assets/og.png
//
// Fonts: the card prefers Inter, then falls back to the landing page's stack,
// so the exact letterforms depend on the machine that renders it (Segoe UI on
// Windows, SF on macOS, DejaVu/Noto on Linux). The committed PNG is the source
// of truth — regenerate on a machine with a decent sans if it looks off.
import { app, BrowserWindow } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'web', 'assets', 'og.png');
const W = 1200;
const H = 630;

// capturePage() captures at the display's scale factor; force 1x so the output
// is exactly 1200x630 regardless of DPI.
app.commandLine.appendSwitch('force-device-scale-factor', '1');
app.on('window-all-closed', () => {});

// Inline the icon: a data: page cannot load file:// resources.
const iconUrl = 'data:image/png;base64,' +
  fs.readFileSync(path.join(ROOT, 'web', 'assets', 'icon.png')).toString('base64');

// Hour ticks on the bar, like the app's (subtle, darker notches on the fill).
const ticks = Array.from({ length: 7 }, (_, i) =>
  `<div class="tick" style="top:${((i + 1) * 100) / 8}%"></div>`).join('');

const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: ${W}px; height: ${H}px; overflow: hidden; }
  body {
    background: #090d13;
    color: #e2e9f3;
    font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI",
      "Hiragino Kaku Gothic ProN", "Noto Sans JP", Meiryo, system-ui, sans-serif;
    position: relative;
  }

  /* ---- ambient glow: light leaks inward from the bar at the right edge ---- */
  .glow {
    position: absolute; inset: 0;
    background:
      radial-gradient(820px 620px at 103% 80%, rgba(95, 176, 251, 0.30), transparent 66%),
      radial-gradient(900px 420px at 88% -10%, rgba(95, 176, 251, 0.12), transparent 60%);
  }

  /* ---- the bar: DayGlassBar itself on the screen's right edge ---- */
  .bar { position: absolute; top: 0; right: 0; width: 18px; height: 100%; }
  .bar .track { position: absolute; inset: 0; background: rgba(255, 255, 255, 0.06); }
  .bar .fill {
    position: absolute; left: 0; right: 0; bottom: 0; height: 62%;
    background: linear-gradient(to bottom, #5fb0fb, #7cc0ff);
    box-shadow: 0 0 70px 10px rgba(95, 176, 251, 0.55);
  }
  .bar .tick { position: absolute; left: 0; right: 0; height: 2px; background: rgba(9, 13, 19, 0.16); }

  /* ---- copy, vertically centered on the left ---- */
  .copy {
    position: absolute; left: 84px; top: 0; height: 100%; width: 900px;
    display: flex; flex-direction: column; justify-content: center; gap: 30px;
  }
  .brand { display: flex; align-items: center; gap: 26px; }
  .brand img { width: 92px; height: 92px; border-radius: 22px; }
  .brand h1 { font-size: 78px; font-weight: 800; letter-spacing: -2px; }
  .tagline { font-size: 40px; font-weight: 600; color: #e2e9f3; }
  .sub { font-size: 26px; color: #93a6bf; line-height: 1.45; max-width: 820px; }
  .badge {
    display: inline-block; align-self: flex-start; margin-top: 6px;
    border: 1px solid rgba(255, 255, 255, 0.12); background: rgba(255, 255, 255, 0.04);
    border-radius: 999px; padding: 10px 24px;
    font-size: 22px; color: #93a6bf;
  }
</style></head>
<body>
  <div class="glow"></div>
  <div class="bar">
    <div class="track"></div>
    <div class="fill">${ticks}</div>
  </div>
  <div class="copy">
    <div class="brand">
      <img src="${iconUrl}" alt="">
      <h1>DayGlassBar</h1>
    </div>
    <div class="tagline">See your day drain &mdash; quietly.</div>
    <div class="sub">An ambient edge-of-screen bar for the time left in your day &mdash;<br>no numbers, no color changes, no alarms.</div>
    <div class="badge">Free &middot; Windows &amp; macOS</div>
  </div>
</body></html>`;

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: W,
    height: H,
    useContentSize: true,
    frame: false,
    show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
  win.showInactive(); // a hidden window may not paint; capturePage would be blank
  await new Promise((r) => setTimeout(r, 400)); // let the renderer paint
  const img = await win.webContents.capturePage();
  fs.writeFileSync(OUT, img.toPNG());
  console.log('size  =', JSON.stringify(img.getSize()));
  console.log('saved =', path.relative(ROOT, OUT));
  win.destroy();
  app.quit();
});
