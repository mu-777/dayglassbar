// Preload for the settings window. CommonJS (.cjs) on purpose — the project is
// ESM ("type": "module") but Electron preloads are loaded as CommonJS.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getSettings: () => ipcRenderer.invoke('settings:get'),
  getAppVersion: () => ipcRenderer.invoke('app:version'),
  checkUpdates: () => ipcRenderer.invoke('app:check-updates'),
  getI18n: () => ipcRenderer.invoke('i18n:catalog'),
  saveSettings: (settings) => ipcRenderer.invoke('settings:save', settings),
  resetSettings: () => ipcRenderer.invoke('settings:reset'),
  listDisplays: () => ipcRenderer.invoke('displays:list'),
  exportSettings: () => ipcRenderer.invoke('settings:export'),
  importSettings: () => ipcRenderer.invoke('settings:import'),
  exportDiagnostics: () => ipcRenderer.invoke('diagnostics:export'),
  calendarStatus: () => ipcRenderer.invoke('calendar:status'),
  calendarConnect: (provider) => ipcRenderer.invoke('calendar:connect', provider),
  calendarDisconnect: (provider) => ipcRenderer.invoke('calendar:disconnect', provider),
  calendarListCalendars: (source) => ipcRenderer.invoke('calendar:list-calendars', source),
  calendarSetSelection: (source, ids) => ipcRenderer.invoke('calendar:set-selection', source, ids),
  // Open a vetted external URL (the donation link) in the system browser. The bar
  // window has no equivalent — it stays click-through and never opens anything.
  openExternal: (url) => ipcRenderer.invoke('shell:open-external', url),
});
