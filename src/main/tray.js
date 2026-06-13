// Tray residency (spec 4.5). Windows: task tray. macOS: menu bar status item
// (template image so it follows light/dark menu bars).
import path from 'node:path';
import { Tray, Menu, nativeImage, app } from 'electron';

export function createAppTray({ onOpenSettings, onQuit, getSummary }) {
  const assetsDir = path.join(app.getAppPath(), 'assets');
  const iconFile = process.platform === 'darwin' ? 'trayTemplate.png' : 'tray.png';
  const image = nativeImage.createFromPath(path.join(assetsDir, iconFile));
  if (process.platform === 'darwin') image.setTemplateImage(true);

  const tray = new Tray(image);
  tray.setToolTip('DayGlassBar');

  function rebuild() {
    const menu = Menu.buildFromTemplate([
      { label: getSummary(), enabled: false },
      { type: 'separator' },
      { label: '設定...', click: onOpenSettings },
      { type: 'separator' },
      { label: '終了', click: onQuit },
    ]);
    tray.setContextMenu(menu);
  }

  rebuild();
  tray.on('double-click', onOpenSettings);
  return { rebuild };
}
