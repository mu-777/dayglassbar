// Tray residency (spec 4.5). Windows: task tray. macOS: menu bar status item
// (template image so it follows light/dark menu bars).
import path from 'node:path';
import { Tray, Menu, nativeImage, app } from 'electron';

// `onToggleHidden` / `isHidden` drive the "hide until tomorrow" checkbox item — the one
// control the click-through bar cannot offer itself (invariant #6), so it lives here.
export function createAppTray({ onOpenSettings, onQuit, onToggleHidden, getSummary, getLabels, isHidden = () => false }) {
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
    // Order matters. "Settings…" stays the FIRST clickable item because that is where it has
    // always been and where people aim without reading — putting the hide toggle there cost a
    // user their bar: they hit it on the way to Settings, and a hidden bar looks exactly like a
    // broken one (it is gone from every display and survives a restart). The hide toggle
    // therefore sits below Settings, fenced by separators.
    // Checkbox rather than a label that flips wording: the tick shows at a glance that the bar
    // is hidden on purpose — and it clears itself when the hide expires, because main rebuilds
    // the menu from the bar's own visibility change.
    const menu = Menu.buildFromTemplate([
      { label: getSummary(), enabled: false },
      { type: 'separator' },
      { label: labels.settings, click: onOpenSettings },
      { type: 'separator' },
      {
        label: labels.hide,
        toolTip: labels.hideHint,
        type: 'checkbox',
        checked: isHidden(),
        click: onToggleHidden,
      },
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
