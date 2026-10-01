const { contextBridge, ipcRenderer } = require('electron');

// Exposição estrita e segura de APIs nativas para o Renderer
contextBridge.exposeInMainWorld('electronAPI', {
  isDesktop: true,
  platform: process.platform,
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
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
  },
  onUpdateNotAvailable: (callback) => {
    const handler = (event, info) => callback(info);
    ipcRenderer.on('update-not-available', handler);
    return () => ipcRenderer.removeListener('update-not-available', handler);
  }
});


// Exposição restrita e segura da Bridge de Interação Desktop
contextBridge.exposeInMainWorld('desktopInteraction', {
  isAvailable: true,
  getDisplays: () => ipcRenderer.invoke('get-desktop-displays'),
  setAuthorizedSession: (sessionId, guestId) => ipcRenderer.invoke('interaction-set-authorized-session', { sessionId, guestId }),
  revokeSession: () => ipcRenderer.invoke('interaction-revoke-session'),
  movePointer: (sessionId, displayId, normX, normY) => ipcRenderer.invoke('interaction-move-pointer', { sessionId, displayId, normX, normY }),
  pointerDown: (sessionId, button, displayId, normX, normY) => ipcRenderer.invoke('interaction-pointer-down', { sessionId, button, displayId, normX, normY }),
  pointerUp: (sessionId, button, displayId, normX, normY) => ipcRenderer.invoke('interaction-pointer-up', { sessionId, button, displayId, normX, normY }),
  scroll: (sessionId, deltaY, deltaX) => ipcRenderer.invoke('interaction-scroll', { sessionId, deltaY, deltaX }),
  keyDown: (sessionId, key) => ipcRenderer.invoke('interaction-key-down', { sessionId, key }),
  keyUp: (sessionId, key) => ipcRenderer.invoke('interaction-key-up', { sessionId, key })
});

