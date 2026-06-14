// Render the bar once and save PNG snapshots, so a human can eyeball the drawing
// where the live overlay can't be shown (notably WSLg, which renders the window
// but doesn't composite the transparent always-on-top overlay to the desktop).
//
// Honors the time-simulation env vars (DAYGLASSBAR_FAKE_NOW / _TIME_SCALE /
// _TIME_OFFSET_MIN) and reads the same settings.json as the real app.
//
//   npm run capture                 # -> <tmpdir>/dayglassbar-capture{,-expanded}.png
//   npm run capture -- out.png      # -> out.png and out-expanded.png
//   DAYGLASSBAR_FAKE_NOW="2026-06-15 14:00" npm run capture
import { app, BrowserWindow, screen } from 'electron';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Match the real app's name so getPath('userData') points at the same settings.json
// (when launched as `electron <script>` the name would otherwise default to "Electron").
app.setName('DayGlassBar');
// We open/close windows in sequence; don't let Electron auto-quit between shots.
app.on('window-all-closed', () => {});

const { createStore } = await import(path.join(ROOT, 'src/main/store.js'));
const { timeSourceFromEnv } = await import(path.join(ROOT, 'src/core/time-source.js'));
const { getBarState } = await import(path.join(ROOT, 'src/core/schedule.js'));
const { computeBarBounds } = await import(path.join(ROOT, 'src/core/geometry.js'));

const outArg = process.argv.slice(2).find((a) => a.toLowerCase().endsWith('.png'));
const OUT = outArg ? path.resolve(outArg) : path.join(os.tmpdir(), 'dayglassbar-capture.png');
const base = OUT.replace(/\.png$/i, '');

app.whenReady().then(async () => {
  const timeSource = timeSourceFromEnv(process.env);
  const store = createStore(app.getPath('userData'));
  const settings = store.get();
  const ap = settings.appearance;
  const display =
    ap.displayId != null
      ? screen.getAllDisplays().find((d) => d.id === ap.displayId) || screen.getPrimaryDisplay()
      : screen.getPrimaryDisplay();

  const state = getBarState(settings.schedule, timeSource.now(), {
    tickIntervalMinutes: ap.ticks.enabled ? ap.ticks.intervalMinutes : 0,
  });

  // Drive via did-finish-load (not `await loadFile`): a transparent window can
  // reject the loadFile promise with ERR_FAILED even when the page loads fine.
  function shot(expanded, file) {
    return new Promise((resolve, reject) => {
      const thickness = expanded ? settings.behavior.hover.expandedThickness : ap.thickness;
      const bounds = computeBarBounds(display.workArea, ap.edge, thickness);
      const win = new BrowserWindow({
        ...bounds,
        frame: false,
        transparent: true,
        show: false,
        webPreferences: {
          preload: path.join(ROOT, 'src/preload/bar-preload.cjs'),
          contextIsolation: true,
          nodeIntegration: false,
        },
      });
      win.webContents.on('did-fail-load', (_e, code, desc, url) =>
        reject(new Error(`did-fail-load ${code} ${desc} ${url}`)),
      );
      win.webContents.once('did-finish-load', async () => {
        try {
          win.webContents.send('bar:state', { state, appearance: ap, expanded });
          win.showInactive(); // a hidden window may not paint; capturePage would be blank
          await new Promise((r) => setTimeout(r, 300)); // let the renderer paint
          const img = await win.webContents.capturePage();
          fs.writeFileSync(file, img.toPNG());
          const size = img.getSize();
          win.destroy();
          resolve(size);
        } catch (e) {
          reject(e);
        }
      });
      win.loadFile(path.join(ROOT, 'src/renderer/bar/index.html'));
    });
  }

  const sz = await shot(false, `${base}.png`);
  await shot(true, `${base}-expanded.png`);

  console.log('now    =', new Date(timeSource.now()).toString().slice(0, 24));
  console.log('mode   =', state.mode, state.labels ? JSON.stringify(state.labels) : '');
  console.log('size   =', JSON.stringify(sz), '(edge:', ap.edge + ', thickness:', ap.thickness + ')');
  console.log('saved  =', `${base}.png`);
  console.log('         ${base}-expanded.png'.replace('${base}', base));
  app.quit();
});
