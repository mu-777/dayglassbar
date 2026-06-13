// Preload for the bar window. CommonJS (.cjs) on purpose — the project is ESM
// ("type": "module") but Electron preloads are loaded as CommonJS.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('dayglass', {
  onState: (cb) => ipcRenderer.on('bar:state', (_e, payload) => cb(payload)),
  openSettings: () => ipcRenderer.send('bar:open-settings'),
});
