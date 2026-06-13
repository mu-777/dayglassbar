// Preload for the settings window. CommonJS (.cjs) on purpose — the project is
// ESM ("type": "module") but Electron preloads are loaded as CommonJS.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getSettings: () => ipcRenderer.invoke('settings:get'),
  validateSettings: (settings) => ipcRenderer.invoke('settings:validate', settings),
  saveSettings: (settings) => ipcRenderer.invoke('settings:save', settings),
  listDisplays: () => ipcRenderer.invoke('displays:list'),
});
