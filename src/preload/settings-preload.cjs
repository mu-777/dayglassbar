// Preload for the settings window. CommonJS (.cjs) on purpose — the project is
// ESM ("type": "module") but Electron preloads are loaded as CommonJS.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getSettings: () => ipcRenderer.invoke('settings:get'),
  getI18n: () => ipcRenderer.invoke('i18n:catalog'),
  validateSettings: (settings) => ipcRenderer.invoke('settings:validate', settings),
  saveSettings: (settings) => ipcRenderer.invoke('settings:save', settings),
  listDisplays: () => ipcRenderer.invoke('displays:list'),
  exportSettings: () => ipcRenderer.invoke('settings:export'),
  importSettings: () => ipcRenderer.invoke('settings:import'),
  exportDiagnostics: () => ipcRenderer.invoke('diagnostics:export'),
  calendarStatus: () => ipcRenderer.invoke('calendar:status'),
  calendarConnect: (provider) => ipcRenderer.invoke('calendar:connect', provider),
  calendarDisconnect: (provider) => ipcRenderer.invoke('calendar:disconnect', provider),
  calendarListCalendars: (source) => ipcRenderer.invoke('calendar:list-calendars', source),
  calendarSetSelection: (source, ids) => ipcRenderer.invoke('calendar:set-selection', source, ids),
});
