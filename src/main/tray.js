// Tray residency (spec 4.5). Windows: task tray. macOS: menu bar status item
// (template image so it follows light/dark menu bars).
import path from 'node:path';
import { Tray, Menu, nativeImage, app } from 'electron';

export function createAppTray({ onOpenSettings, onQuit, getSummary, getLabels }) {
  const assetsDir = path.join(app.getAppPath(), 'assets');
  const iconFile = process.platform === 'darwin' ? 'trayTemplate.png' : 'tray.png';
  const image = nativeImage.createFromPath(path.join(assetsDir, iconFile));
  if (process.platform === 'darwin') image.setTemplateImage(true);

  const tray = new Tray(image);
  tray.setToolTip('DayGlassBar'); // replaced by the localized tooltip on the first rebuild()

  // getLabels() is read on every rebuild() so the menu (and tooltip) re-localize when
  // the language setting changes (index.js rebuilds the tray on store.onChange).
  function rebuild() {
    const labels = getLabels();
    // Hover hint so people who do find the icon learn it opens settings (the
    // in-app first-run guide is the primary discovery path).
    tray.setToolTip(labels.tooltip);
    const menu = Menu.buildFromTemplate([
      { label: getSummary(), enabled: false },
      { type: 'separator' },
      { label: labels.settings, click: onOpenSettings },
      { type: 'separator' },
      { label: labels.quit, click: onQuit },
    ]);
    tray.setContextMenu(menu);
  }

  rebuild();
  tray.on('double-click', onOpenSettings);
  // On Windows, a single left-click on the tray icon is otherwise a dead end (only
  // right-click/double-click did anything) — pop the same context menu so left-click also
  // works. On macOS the context menu is already assigned via setContextMenu, so the OS
  // shows it on any click and this handler never fires there; this is effectively Windows-only.
  tray.on('click', () => tray.popUpContextMenu());
  return { rebuild };
}
