const { contextBridge, ipcRenderer } = require('electron');

// Exposição estrita e segura de APIs nativas para o Renderer
contextBridge.exposeInMainWorld('electronAPI', {
  isDesktop: true,
  platform: process.platform,
  getScreenSources: () => ipcRenderer.invoke('get-screen-sources'),
  log: (type, message, meta) => ipcRenderer.invoke('write-desktop-log', { type, message, meta })
});
