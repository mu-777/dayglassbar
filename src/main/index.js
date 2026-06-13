// DayGlassBar entry point (main process).
import { app, ipcMain, screen } from 'electron';
import { createStore } from './store.js';
import { createBarController } from './bar-window.js';
import { openSettingsWindow } from './settings-window.js';
import { createAppTray } from './tray.js';
import { timeSourceFromEnv, isSimulated } from '../core/time-source.js';
import { validateSettings } from '../core/validate.js';
import { resolveDay, formatMinutes } from '../core/schedule.js';

// Single instance (spec 4.5). A second launch just opens the settings window
// of the running instance.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  main();
}

function main() {
  const timeSource = timeSourceFromEnv(process.env);
  let store;
  let bar;
  let trayCtl;

  app.on('second-instance', () => openSettingsWindow());
  // Tray-resident app: closing the settings window must not quit (spec 4.5).
  app.on('window-all-closed', () => {});
  app.on('before-quit', () => {
    if (bar) bar.dispose();
  });

  app.whenReady().then(() => {
    if (process.platform === 'darwin' && app.dock) app.dock.hide();

    store = createStore(app.getPath('userData'));
    bar = createBarController({ store, timeSource });
    trayCtl = createAppTray({
      onOpenSettings: () => openSettingsWindow(),
      onQuit: () => app.quit(),
      getSummary: summaryLine,
    });

    registerIpc();
    applyAutoLaunch();
    bar.start();

    store.onChange(() => {
      applyAutoLaunch();
      trayCtl.rebuild();
    });
    // Keep the "today: …" tray line fresh across midnight.
    setInterval(() => trayCtl.rebuild(), 60 * 60 * 1000);
  });

  function summaryLine() {
    const rec = resolveDay(store.get().schedule, new Date(timeSource.now()));
    const sim = isSimulated(process.env) ? '［時刻シミュレーション中］' : '';
    if (!rec.enabled) return `今日: 休み ${sim}`.trim();
    return `今日: ${formatMinutes(rec.startMin)}〜${formatMinutes(rec.endMin)} ${sim}`.trim();
  }

  function applyAutoLaunch() {
    if (process.platform === 'linux') return; // out of scope (spec 1)
    app.setLoginItemSettings({ openAtLogin: Boolean(store.get().behavior.autoLaunch) });
  }

  function registerIpc() {
    ipcMain.handle('settings:get', () => store.get());
    ipcMain.handle('settings:validate', (_e, candidate) => validateSettings(candidate));
    ipcMain.handle('settings:save', (_e, candidate) => {
      const result = validateSettings(candidate);
      if (result.ok) store.save(candidate); // store.onChange fans out to the bar etc.
      return result;
    });
    ipcMain.handle('displays:list', () => {
      const primaryId = screen.getPrimaryDisplay().id;
      return screen.getAllDisplays().map((d) => ({
        id: d.id,
        primary: d.id === primaryId,
        label: `${d.bounds.width}×${d.bounds.height}（${d.bounds.x}, ${d.bounds.y}）${
          d.id === primaryId ? '・プライマリ' : ''
        }`,
      }));
    });
    ipcMain.on('bar:open-settings', () => openSettingsWindow());
  }
}
