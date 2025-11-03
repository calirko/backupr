const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),
  getBackupConfig: () => ipcRenderer.invoke('get-backup-config'),
  saveBackupConfig: (config) => ipcRenderer.invoke('save-backup-config', config)
});
