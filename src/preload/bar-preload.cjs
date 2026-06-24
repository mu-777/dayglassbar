// Preload for the bar window. CommonJS (.cjs) on purpose — the project is ESM
// ("type": "module") but Electron preloads are loaded as CommonJS.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('dayglass', {
  onState: (cb) => ipcRenderer.on('bar:state', (_e, payload) => cb(payload)),
  // No openSettings: the bar is click-through at all times, so it never opens
  // the settings window — that is done from the tray (see src/main/tray.js).
});
