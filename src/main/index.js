// DayGlassBar entry point (main process).
import fs from 'node:fs';
import path from 'node:path';
import { app, ipcMain, screen, dialog, shell, BrowserWindow, powerMonitor } from 'electron';
import { createLogger, levelFromEnv } from './logger.js';
import { createStore } from './store.js';
import { buildDiagnosticsZip } from './diagnostics.js';
import { createBarController } from './bar-window.js';
import { openSettingsWindow } from './settings-window.js';
import { createAppTray } from './tray.js';
import { createCalendarService } from './calendar/index.js';
import { timeSourceFromEnv, isSimulated } from '../core/time-source.js';
import { validateSettings } from '../core/validate.js';
import { getActiveDaySummary, formatMinutes, dateKeyOf, prunePastOverrides } from '../core/schedule.js';
import { t, LANGUAGES, DEFAULT_LANGUAGE, MESSAGES, LANGUAGE_NAMES, languageFromLocale } from '../core/i18n.js';
import { isNewerVersion } from '../core/version.js';

// Single instance (spec 4.5). A second launch just opens the settings window
// of the running instance.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  main();
}

function main() {
  const timeSource = timeSourceFromEnv(process.env);
  // One log file for the whole process (rotated). Children tag their scope. In dev
  // (`npm start`, unpackaged) records are also echoed to the terminal.
  const log = createLogger({
    dir: path.join(app.getPath('userData'), 'logs'),
    level: levelFromEnv(process.env),
    mirror: !app.isPackaged,
  });
  // Last-resort capture: anything escaping a try/catch still lands in the log file.
  process.on('uncaughtException', (err) => log.error('uncaughtException', err));
  process.on('unhandledRejection', (reason) =>
    log.error('unhandledRejection', reason instanceof Error ? reason : { reason: String(reason) }));
  app.on('render-process-gone', (_e, _wc, details) => log.error('render-process-gone', details));
  app.on('child-process-gone', (_e, details) => log.error('child-process-gone', details));

  let store;
  let bar;
  let trayCtl;
  let calendar;

  // Active UI language (from settings; defaults to English) and a bound translator.
  const lang = () => store.get().language || DEFAULT_LANGUAGE;
  const tr = (key, params) => t(lang(), key, params);

  app.on('second-instance', () => {
    log.debug('second instance launched; opening settings');
    openSettingsWindow();
  });
  // Tray-resident app: closing the settings window must not quit (spec 4.5).
  app.on('window-all-closed', () => {});
  app.on('before-quit', () => {
    log.info('quitting');
    if (bar) bar.dispose();
    if (calendar) calendar.dispose();
  });

  app.whenReady().then(() => {
    if (process.platform === 'darwin' && app.dock) app.dock.hide();

    log.info('starting', {
      version: app.getVersion(),
      electron: process.versions.electron,
      platform: process.platform,
      arch: process.arch,
      locale: app.getLocale(),
      simulatedTime: isSimulated(process.env),
      displays: screen.getAllDisplays().length,
    });

    // app.getLocale() needs the app ready, which we are here — derive this machine's
    // default UI language from it so a first run (and any settings.json missing
    // `language`) comes up in the OS's language rather than hardcoded English.
    store = createStore(app.getPath('userData'), log.child('store'), {
      defaultLanguage: languageFromLocale(app.getLocale()),
    });

    // D-3: date overrides would otherwise accumulate forever. Prune anything strictly
    // before yesterday on every startup — yesterday itself is kept in case an overnight
    // interval that started yesterday is still running into today (prunePastOverrides).
    {
      const before = store.get().schedule.overrides;
      const { changed, overrides } = prunePastOverrides(before, timeSource.now());
      if (changed) {
        const next = structuredClone(store.get());
        next.schedule.overrides = overrides;
        store.save(next);
        log.info('pruned past overrides', { count: Object.keys(before).length - Object.keys(overrides).length });
      }
    }

    calendar = createCalendarService({
      timeSource,
      getCalendarSettings: () => store.get().appearance.calendar,
      log: log.child('calendar'),
    });
    bar = createBarController({ store, timeSource, calendar, log: log.child('bar') });
    trayCtl = createAppTray({
      onOpenSettings: () => openSettingsWindow(),
      onQuit: () => app.quit(),
      getSummary: summaryLine,
      getLabels: () => ({ settings: tr('tray.settings'), quit: tr('tray.quit'), tooltip: tr('tray.tooltip') }),
    });

    registerIpc();
    applyAutoLaunch();
    bar.start();
    calendar.start();

    store.onChange(() => {
      applyAutoLaunch();
      trayCtl.rebuild();
      calendar.refresh(); // toggling the overlay on/off re-fetches or clears the cache
    });
    // Keep the "today: …" tray line fresh across midnight.
    setInterval(() => trayCtl.rebuild(), 60 * 60 * 1000);

    // Sleep can pause the refresh timers and leave events stale on wake. The bar's time math is
    // always recomputed from the wall clock (invariant #1), but the cached events are not — so
    // pull a fresh copy on resume instead of waiting for the next interval tick.
    powerMonitor.on('resume', () => {
      log.info('system resume — refreshing calendar');
      calendar.refresh();
    });

    // First launch only: the bar is click-through and the app has no window of its own,
    // so a brand-new user has no obvious way to discover that settings live in the tray.
    // Open the settings window once (it shows a one-time hint pointing back to the tray
    // for next time). One-shot onboarding — never recurs, so it doesn't "rush" (invariant #4).
    if (!store.isOnboarded()) {
      store.markOnboarded();
      openSettingsWindow({ firstRun: true });
    }
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
    try {
      const opts = { openAtLogin: Boolean(store.get().behavior.autoLaunch) };
      // The portable Windows build self-extracts to a per-run temp folder, so
      // process.execPath points at a path that vanishes after the process exits;
      // registering it would break the login item on the next login. electron-builder
      // exposes the real launcher path via PORTABLE_EXECUTABLE_FILE — use that instead.
      if (process.platform === 'win32') opts.path = process.env.PORTABLE_EXECUTABLE_FILE || process.execPath;
      app.setLoginItemSettings(opts);
    } catch (err) {
      log.warn('setLoginItemSettings failed', err);
    }
  }

  function registerIpc() {
    const ipcLog = log.child('ipc');
    ipcMain.handle('settings:get', () => store.get());
    ipcMain.handle('settings:save', (_e, candidate) => {
      const result = validateSettings(candidate);
      if (result.ok) {
        try {
          store.save(candidate); // store.onChange fans out to the bar etc.
          ipcLog.debug('settings saved');
        } catch (err) {
          // Disk full / permissions: validation passed but the write itself failed —
          // report it the same way export/diagnostics do, instead of pretending it saved.
          ipcLog.error('settings save failed (write)', err);
          return { ok: false, errors: [], error: tr('io.writeFail', { msg: err.message }) };
        }
      } else {
        ipcLog.warn('settings save rejected (validation)', { errors: result.errors });
      }
      return result;
    });
    // Reset settings.json to this store's instance defaults (D-1) — DEFAULT_SETTINGS with
    // the machine's OS-locale language, so a reset lands the user back where a fresh
    // install on this machine would. Deliberately does NOT touch calendar-accounts.enc —
    // OAuth connections and calendar selections are a separate, encrypted store
    // (invariant #7), so a reset never signs the user out.
    ipcMain.handle('settings:reset', () => {
      try {
        store.save(store.getDefaults());
        ipcLog.info('settings reset to defaults');
        return { ok: true };
      } catch (err) {
        ipcLog.error('settings reset failed (write)', err);
        return { ok: false, error: tr('io.writeFail', { msg: err.message }) };
      }
    });
    // Calendar connection state (no secrets leave the main process — just provider,
    // connected flag, account email). The settings UI queries this, not settings.json.
    ipcMain.handle('calendar:status', () => ({
      accounts: calendar.status(),
      encryptionAvailable: calendar.encryptionAvailable(),
    }));
    // Run the OAuth flow for a provider (opens the system browser). On success, turn the
    // overlay on so the just-connected calendar is immediately visible.
    ipcMain.handle('calendar:connect', async (_e, provider) => {
      ipcLog.info('calendar connect requested', { provider });
      try {
        const accounts = await calendar.connect(provider);
        // Turn the just-connected provider's overlay on (and pin Outlook to the cloud method).
        const next = structuredClone(store.get());
        const cal = next.appearance.calendar;
        if (provider === 'google') cal.google.enabled = true;
        else if (provider === 'microsoft') {
          cal.outlook.enabled = true;
          cal.outlook.method = 'cloud';
        }
        store.save(next);
        ipcLog.info('calendar connected', { provider });
        return { ok: true, accounts };
      } catch (err) {
        ipcLog.warn('calendar connect failed', { provider, error: err.message });
        return { ok: false, error: err.message };
      }
    });
    ipcMain.handle('calendar:disconnect', (_e, provider) => {
      ipcLog.info('calendar disconnect', { provider });
      return { ok: true, accounts: calendar.disconnect(provider) };
    });
    // List the calendars a source exposes (+ current selection) so the settings UI can let the
    // user pick which to show. Network/COM call — done on demand, not on every settings open.
    ipcMain.handle('calendar:list-calendars', async (_e, source) => {
      try {
        return { ok: true, ...(await calendar.listCalendars(source)) };
      } catch (err) {
        ipcLog.warn('calendar list failed', { source, error: err.message });
        return { ok: false, error: err.message };
      }
    });
    // Persist which calendars a source shows. Selection lives in the encrypted store (not
    // settings.json), so it is saved here directly rather than via settings:save.
    ipcMain.handle('calendar:set-selection', (_e, source, ids) => {
      ipcLog.info('calendar selection set', { source, count: Array.isArray(ids) ? ids.length : 0 });
      return { ok: true, selected: calendar.setCalendarSelection(source, ids) };
    });
    // Open an external link (the settings UI's donation link) in the system browser.
    // Restricted to http(s) so a compromised renderer can't open file:// or app: URLs.
    ipcMain.handle('shell:open-external', (_e, url) => {
      if (typeof url === 'string' && /^https?:\/\//i.test(url)) shell.openExternal(url);
    });
    // App version (from package.json via Electron) so the settings UI can show it —
    // the only place an installed user can read the version without the log/diagnostics.
    ipcMain.handle('app:version', () => app.getVersion());
    // Manual update check (settings footer button only). No automatic/background
    // polling — checking for updates unprompted would be a "rush" cue we don't want
    // (invariant #4), so this only ever runs when the user clicks the button.
    ipcMain.handle('app:check-updates', async () => {
      try {
        const res = await fetch('https://api.github.com/repos/mu-777/dayglassbar/releases/latest', {
          headers: { Accept: 'application/vnd.github+json' },
          signal: AbortSignal.timeout(10000), // the button sits disabled on "Checking…" until this settles — never hang it
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const latest = String(data.tag_name || '').replace(/^v/, '');
        const current = app.getVersion();
        return { ok: true, current, latest, hasUpdate: isNewerVersion(latest, current), url: data.html_url || 'https://github.com/mu-777/dayglassbar/releases' };
      } catch (err) {
        ipcLog.warn('update check failed', { error: err.message });
        return { ok: false, error: err.message };
      }
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
      if (!result.ok) {
        ipcLog.warn('settings import rejected (validation)', { file: filePaths[0], errors: result.errors });
        return { ok: false, errors: result.errors };
      }
      try {
        store.save(candidate); // store.onChange fans out to the bar etc.
      } catch (err) {
        ipcLog.error('settings import failed (write)', err);
        return { ok: false, error: tr('io.writeFail', { msg: err.message }) };
      }
      ipcLog.info('settings imported', { file: filePaths[0] });
      return { ok: true };
    });

    // Diagnostics dump (support aid): bundle logs + environment + settings into one
    // .zip the user saves and sends however they like (no network — invariant #7).
    // Secrets are excluded (tokens stay in calendar-accounts.enc; see diagnostics.js).
    ipcMain.handle('diagnostics:export', async (e) => {
      const parent = BrowserWindow.fromWebContents(e.sender);
      let bundle;
      try {
        bundle = buildDiagnosticsZip({ app, screen, store });
      } catch (err) {
        ipcLog.error('diagnostics build failed', err);
        return { ok: false, error: tr('io.writeFail', { msg: err.message }) };
      }
      const { canceled, filePath } = await dialog.showSaveDialog(parent, {
        title: tr('dialog.diagnosticsTitle'),
        defaultPath: bundle.filename,
        filters: [{ name: 'ZIP', extensions: ['zip'] }],
      });
      if (canceled || !filePath) return { ok: false, canceled: true };
      try {
        fs.writeFileSync(filePath, bundle.buffer);
        shell.showItemInFolder(filePath); // reveal it so the user can grab/inspect it
        ipcLog.info('diagnostics saved', { reportId: bundle.reportId, filePath, bytes: bundle.buffer.length });
        return { ok: true, filePath };
      } catch (err) {
        ipcLog.error('diagnostics save failed', err);
        return { ok: false, error: tr('io.writeFail', { msg: err.message }) };
      }
    });
  }
}
