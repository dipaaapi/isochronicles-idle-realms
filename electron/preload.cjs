/** Narrow bridge between the game page and the Electron main process (see main.cjs). */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('isoDesktop', {
  readSave: (key) => ipcRenderer.invoke('save:read', key),
  writeSave: (key, value) => ipcRenderer.invoke('save:write', key, value),
  removeSave: (key) => ipcRenderer.invoke('save:remove', key),
  unlockAchievement: (id) => ipcRenderer.invoke('steam:achievement', id),
  quit: () => ipcRenderer.invoke('app:quit'),
});
