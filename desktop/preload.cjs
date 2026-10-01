const { contextBridge, ipcRenderer } = require('electron');

// Exposição estrita e segura de APIs nativas para o Renderer
contextBridge.exposeInMainWorld('electronAPI', {
  isDesktop: true,
  platform: process.platform,
  getScreenSources: () => ipcRenderer.invoke('get-screen-sources'),
  log: (type, message, meta) => ipcRenderer.invoke('write-desktop-log', { type, message, meta }),
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  startDownloadUpdate: () => ipcRenderer.invoke('start-download-update'),
  restartAndInstallUpdate: () => ipcRenderer.invoke('restart-and-install-update'),
  onUpdateAvailable: (callback) => {
    const handler = (event, info) => callback(info);
    ipcRenderer.on('update-available', handler);
    return () => ipcRenderer.removeListener('update-available', handler);
  },
  onUpdateDownloaded: (callback) => {
    const handler = (event, info) => callback(info);
    ipcRenderer.on('update-downloaded', handler);
    return () => ipcRenderer.removeListener('update-downloaded', handler);
  },
  onUpdateDownloading: (callback) => {
    const handler = (event, progress) => callback(progress);
    ipcRenderer.on('update-downloading', handler);
    return () => ipcRenderer.removeListener('update-downloading', handler);
  },
  onUpdateError: (callback) => {
    const handler = (event, err) => callback(err);
    ipcRenderer.on('update-error', handler);
    return () => ipcRenderer.removeListener('update-error', handler);
  }
});
