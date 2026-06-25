import path from 'node:path';
import { BrowserWindow, app } from 'electron';

let win = null;

export function openSettingsWindow() {
  if (win && !win.isDestroyed()) {
    win.show();
    win.focus();
    return win;
  }
  win = new BrowserWindow({
    width: 840,
    height: 700,
    minWidth: 660,
    minHeight: 480,
    title: 'DayGlassBar', // the renderer sets document.title to the localized title once loaded
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(app.getAppPath(), 'src', 'preload', 'settings-preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.loadFile('src/renderer/settings/index.html');
  win.on('closed', () => {
    win = null;
  });
  return win;
}
