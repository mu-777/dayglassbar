import path from 'node:path';
import { BrowserWindow, app } from 'electron';

let win = null;

// `firstRun` tells the renderer to show the one-time "settings live in the tray"
// guide (used when main auto-opens this window on the very first launch).
export function openSettingsWindow({ firstRun = false } = {}) {
  if (win && !win.isDestroyed()) {
    win.show();
    win.focus();
    return win;
  }
  win = new BrowserWindow({
    width: 840,
    height: 700,
    // minWidth is pinned to the Appearance section's first row (Display / Edge / Thickness):
    // that row is the widest in the form and must keep its three columns, so the settings
    // never reflow into a shape where "where the bar goes" is split across lines. The grid
    // (`repeat(auto-fill, minmax(220px, 1fr))`, 16px gap) needs 748px of *content* width for
    // three tracks; the rest is headroom for the window frame, which is ~16px on Windows and
    // 0 in a bare X server. Re-measure if the grid's minmax, the gap, or main's padding change.
    minWidth: 780,
    minHeight: 480,
    title: 'DayGlassBar', // the renderer sets document.title to the localized title once loaded
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(app.getAppPath(), 'src', 'preload', 'settings-preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.loadFile('src/renderer/settings/index.html', firstRun ? { query: { firstRun: '1' } } : undefined);
  win.on('closed', () => {
    win = null;
  });
  return win;
}
