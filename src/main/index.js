// DayGlassBar entry point (main process).
import fs from 'node:fs';
import { app, ipcMain, screen, dialog, BrowserWindow } from 'electron';
import { createStore } from './store.js';
import { createBarController } from './bar-window.js';
import { openSettingsWindow } from './settings-window.js';
import { createAppTray } from './tray.js';
import { timeSourceFromEnv, isSimulated } from '../core/time-source.js';
import { validateSettings } from '../core/validate.js';
import { getActiveDaySummary, formatMinutes, dateKeyOf } from '../core/schedule.js';

// Long-form weekday labels for the tray summary (Date#getDay() / WEEKDAY_KEYS order).
const WEEKDAY_LABELS = {
  sun: '日曜',
  mon: '月曜',
  tue: '火曜',
  wed: '水曜',
  thu: '木曜',
  fri: '金曜',
  sat: '土曜',
};

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
    // Reflects the *currently active* interval — including an overnight one that
    // started the previous day (e.g. Mon 02:00 inside Sun 9:00–27:00 shows 日曜),
    // not just the naive calendar-today record.
    const s = getActiveDaySummary(store.get().schedule, timeSource.now());
    const sim = isSimulated(process.env) ? '［時刻シミュレーション中］' : '';
    if (!s.enabled) return `今日: 休み ${sim}`.trim();
    const range = `${formatMinutes(s.startMin)}〜${formatMinutes(s.endMin)}`;
    // When a previous-day overnight interval is still running, name its source day
    // instead of saying "今日".
    const isToday = s.dateKey === dateKeyOf(new Date(timeSource.now()));
    const prefix = isToday ? '今日' : WEEKDAY_LABELS[s.weekdayKey];
    return `${prefix}: ${range} ${sim}`.trim();
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

    // Export current settings to a JSON file chosen by the user (file only — no cloud).
    ipcMain.handle('settings:export', async (e) => {
      const parent = BrowserWindow.fromWebContents(e.sender);
      const { canceled, filePath } = await dialog.showSaveDialog(parent, {
        title: '設定をエクスポート',
        defaultPath: 'dayglassbar-settings.json',
        filters: [{ name: 'JSON', extensions: ['json'] }],
      });
      if (canceled || !filePath) return { ok: false, canceled: true };
      try {
        fs.writeFileSync(filePath, JSON.stringify(store.get(), null, 2), 'utf8');
        return { ok: true, filePath };
      } catch (err) {
        return { ok: false, error: `ファイルの書き込みに失敗しました: ${err.message}` };
      }
    });

    // Import settings from a JSON file: validate with the core validator; only
    // persist (→ store.onChange → bar) on success. Never apply invalid/corrupt data.
    ipcMain.handle('settings:import', async (e) => {
      const parent = BrowserWindow.fromWebContents(e.sender);
      const { canceled, filePaths } = await dialog.showOpenDialog(parent, {
        title: '設定をインポート',
        properties: ['openFile'],
        filters: [{ name: 'JSON', extensions: ['json'] }],
      });
      if (canceled || !filePaths || filePaths.length === 0) return { ok: false, canceled: true };
      let candidate;
      try {
        candidate = JSON.parse(fs.readFileSync(filePaths[0], 'utf8'));
      } catch {
        return { ok: false, error: 'ファイルを読み込めませんでした（JSON 形式が不正です）' };
      }
      const result = validateSettings(candidate);
      if (!result.ok) return { ok: false, errors: result.errors };
      store.save(candidate); // store.onChange fans out to the bar etc.
      return { ok: true };
    });
  }
}
