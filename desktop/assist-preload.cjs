const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('assistance', {
  stop: () => ipcRenderer.invoke('interaction-stop-from-indicator')
});
