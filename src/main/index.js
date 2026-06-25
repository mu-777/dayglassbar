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
import { t, LANGUAGES, DEFAULT_LANGUAGE, MESSAGES, LANGUAGE_NAMES } from '../core/i18n.js';

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

  // Active UI language (from settings; defaults to English) and a bound translator.
  const lang = () => store.get().language || DEFAULT_LANGUAGE;
  const tr = (key, params) => t(lang(), key, params);

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
      getLabels: () => ({ settings: tr('tray.settings'), quit: tr('tray.quit') }),
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
    const sim = isSimulated(process.env) ? tr('tray.simNotice') : '';
    if (!s.enabled) return `${tr('tray.today')}: ${tr('tray.dayOff')} ${sim}`.trim();
    const range = `${formatMinutes(s.startMin)}${tr('sep.range')}${formatMinutes(s.endMin)}`;
    // When a previous-day overnight interval is still running, name its source day
    // instead of saying "today".
    const isToday = s.dateKey === dateKeyOf(new Date(timeSource.now()));
    const prefix = isToday ? tr('tray.today') : tr(`weekday.long.${s.weekdayKey}`);
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
    // Whole catalog (all languages) so the settings UI can switch language live.
    ipcMain.handle('i18n:catalog', () => ({
      languages: LANGUAGES,
      defaultLanguage: DEFAULT_LANGUAGE,
      languageNames: LANGUAGE_NAMES,
      messages: MESSAGES,
    }));
    // Raw display geometry; the renderer formats the label (so it follows the live language).
    ipcMain.handle('displays:list', () => {
      const primaryId = screen.getPrimaryDisplay().id;
      return screen.getAllDisplays().map((d) => ({
        id: d.id,
        primary: d.id === primaryId,
        width: d.bounds.width,
        height: d.bounds.height,
        x: d.bounds.x,
        y: d.bounds.y,
      }));
    });

    // Export current settings to a JSON file chosen by the user (file only — no cloud).
    ipcMain.handle('settings:export', async (e) => {
      const parent = BrowserWindow.fromWebContents(e.sender);
      const { canceled, filePath } = await dialog.showSaveDialog(parent, {
        title: tr('dialog.exportTitle'),
        defaultPath: 'dayglassbar-settings.json',
        filters: [{ name: 'JSON', extensions: ['json'] }],
      });
      if (canceled || !filePath) return { ok: false, canceled: true };
      try {
        fs.writeFileSync(filePath, JSON.stringify(store.get(), null, 2), 'utf8');
        return { ok: true, filePath };
      } catch (err) {
        return { ok: false, error: tr('io.writeFail', { msg: err.message }) };
      }
    });

    // Import settings from a JSON file: validate with the core validator; only
    // persist (→ store.onChange → bar) on success. Never apply invalid/corrupt data.
    ipcMain.handle('settings:import', async (e) => {
      const parent = BrowserWindow.fromWebContents(e.sender);
      const { canceled, filePaths } = await dialog.showOpenDialog(parent, {
        title: tr('dialog.importTitle'),
        properties: ['openFile'],
        filters: [{ name: 'JSON', extensions: ['json'] }],
      });
      if (canceled || !filePaths || filePaths.length === 0) return { ok: false, canceled: true };
      let candidate;
      try {
        candidate = JSON.parse(fs.readFileSync(filePaths[0], 'utf8'));
      } catch {
        return { ok: false, error: tr('io.readFail') };
      }
      const result = validateSettings(candidate);
      if (!result.ok) return { ok: false, errors: result.errors };
      store.save(candidate); // store.onChange fans out to the bar etc.
      return { ok: true };
    });
  }
}
