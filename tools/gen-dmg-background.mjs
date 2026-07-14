// Renders the Finder background image(s) for the macOS distribution DMG and
// saves them to assets/dmg/background.png (+ background@2x.png for Retina).
// electron-builder's dmg-builder picks these up automatically when
// build.dmg.background points at background.png: it looks for a sibling
// "<name>@2x.<ext>" file and, if present, combines both into a multi-resolution
// TIFF via `tiffutil -cathidpicheck` before handing it to the DMG customizer
// (node_modules/dmg-builder/out/dmg.js, transformBackgroundFileIfNeed()).
//
// Same zero-extra-dependency approach as gen-og.mjs: an Electron window loads
// an inline HTML page and capturePage() saves the PNG. Unlike gen-og.mjs this
// renders the SAME 540x380 layout twice, once at 1x and once at 2x, by scaling
// every pixel value in the template — not by CSS transform/zoom — so text stays
// genuinely sharp at each resolution instead of being a blown-up bitmap.
//
// Why this image exists: the distributed .dmg is unsigned, so on first launch
// Gatekeeper shows "'DayGlassBar' is damaged and can't be opened" even though
// the file is fine. The background is the one surface a user reliably looks at
// when they open the DMG, so the workaround (drag to Applications, run
// `xattr -cr` once, reopen) is drawn directly into it rather than relying on a
// README nobody reads at that moment.
//
//   npm run dmg-bg        # -> assets/dmg/background.png, background@2x.png
//
// Layout contract with package.json's build.dmg.contents: the app icon sits at
// (130, 150) and the Applications link at (410, 150), icon size 100 (electron-
// builder's x/y are the device-independent-pixel center of the icon, per
// app-builder-lib's scheme.json). This template leaves that band (roughly
// y 60-210 across both icon columns) empty and draws an arrow through the gap
// between them; all instructional text sits below, y ~230-370.
//
// Text is English-only: the image can't switch language at view time, and the
// command itself is language-neutral (decision in docs/macos-signing.md).
//
// Fonts: prefers Inter, then falls back to the landing page's Latin stack, so
// exact letterforms depend on the rendering machine. The committed PNGs are
// the source of truth — regenerate on a machine with a decent sans if they
// look off.
import { app, BrowserWindow } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, 'assets', 'dmg');
const BASE_W = 540;
const BASE_H = 380;

// capturePage() captures at the display's scale factor; force 1x so each
// render's output pixel size is exactly its window's content size, with no
// surprise DPI multiplication layered on top of the explicit @2x pass below.
app.commandLine.appendSwitch('force-device-scale-factor', '1');
app.on('window-all-closed', () => {});

// Builds the page at a given resolution multiplier. Every length below is
// authored in base (1x, 540x380) units and passed through px()/pt() so the
// 2x pass is a real re-layout at double the pixels, not a scaled-up bitmap.
function buildHtml(scale) {
  const px = (n) => Math.round(n * scale) + 'px';
  const pt = (n) => n * scale;

  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: ${px(BASE_W)}; height: ${px(BASE_H)}; overflow: hidden; }
  body {
    background: linear-gradient(180deg, #ffffff 0%, #f2f5f9 100%);
    color: #1f2933;
    font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI",
      system-ui, sans-serif;
    position: relative;
  }
  .mono {
    font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
  }

  /* ---- arrow between the two Finder icon slots (app @130,150 -> Applications
     @410,150, both icon-center coords at 1x, per package.json build.dmg) ---- */
  .arrow { position: absolute; left: ${px(190)}; top: ${px(138)}; width: ${px(160)}; height: ${px(24)}; }
  .arrow .stem {
    position: absolute; left: 0; top: ${px(10)}; width: ${px(128)}; height: ${px(4)};
    background: #5fa8e8; border-radius: ${px(2)};
  }
  .arrow .head {
    position: absolute; left: ${px(124)}; top: 0; width: 0; height: 0;
    border-top: ${px(12)} solid transparent;
    border-bottom: ${px(12)} solid transparent;
    border-left: ${px(18)} solid #5fa8e8;
  }

  /* ---- instructions, below the icon row ---- */
  .panel { position: absolute; left: ${px(46)}; top: ${px(206)}; width: ${px(448)}; }
  .heading {
    font-size: ${pt(13)}px; font-weight: 700; letter-spacing: ${px(0.5)};
    text-transform: uppercase; color: #3d7cb8; margin-bottom: ${px(6)};
  }
  .step { font-size: ${pt(12)}px; line-height: 1.3; margin-bottom: ${px(4)}; color: #1f2933; }
  .step b { font-weight: 700; }
  .code {
    display: inline-block; margin: ${px(2)} 0 ${px(6)}; padding: ${px(3)} ${px(8)};
    background: #eaf0f7; border: 1px solid #d3ddea; border-radius: ${px(4)};
    font-size: ${pt(11)}px; color: #163a5c; white-space: nowrap;
  }
</style></head>
<body>
  <div class="arrow"><div class="stem"></div><div class="head"></div></div>
  <div class="panel">
    <div class="heading">First launch</div>
    <div class="step"><b>1.</b> Drag DayGlassBar into Applications</div>
    <div class="step"><b>2.</b> Run once in Terminal:</div>
    <div class="code mono">xattr -cr /Applications/DayGlassBar.app</div>
    <div class="step"><b>3.</b> Open again &mdash; the &ldquo;damaged&rdquo; alert just means the app is unsigned; the file is fine.</div>
  </div>
</body></html>`;
}

async function render(scale, outFile) {
  const w = Math.round(BASE_W * scale);
  const h = Math.round(BASE_H * scale);
  const win = new BrowserWindow({
    width: w,
    height: h,
    useContentSize: true,
    frame: false,
    show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(buildHtml(scale)));
  win.showInactive(); // a hidden window may not paint; capturePage would be blank
  await new Promise((r) => setTimeout(r, 500)); // let the renderer paint
  const img = await win.webContents.capturePage();
  fs.writeFileSync(outFile, img.toPNG());
  console.log('size  =', JSON.stringify(img.getSize()), '->', path.relative(ROOT, outFile));
  win.destroy();
}

app.whenReady().then(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  await render(1, path.join(OUT_DIR, 'background.png'));
  await render(2, path.join(OUT_DIR, 'background@2x.png'));
  app.quit();
});
