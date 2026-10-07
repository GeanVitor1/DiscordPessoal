const { contextBridge, ipcRenderer } = require('electron');

// Exposição estrita e segura de APIs nativas para o Renderer
contextBridge.exposeInMainWorld('electronAPI', {
  isDesktop: true,
  platform: process.platform,
  desktop:{getSettings:()=>ipcRenderer.invoke('desktop-get-settings'),saveSettings:value=>ipcRenderer.invoke('desktop-set-settings',value),runtime:value=>ipcRenderer.invoke('desktop-runtime',value),minimizeToTray:()=>ipcRenderer.invoke('desktop-minimize-tray'),open:()=>ipcRenderer.invoke('desktop-open'),toggleOverlay:()=>ipcRenderer.invoke('desktop-toggle-overlay'),restart:()=>ipcRenderer.invoke('desktop-restart'),runningApps:()=>ipcRenderer.invoke('desktop-running-apps'),idleSeconds:()=>ipcRenderer.invoke('desktop-idle-seconds'),onAction:callback=>{const handler=(_event,action)=>callback(action);ipcRenderer.on('desktop-action',handler);return()=>ipcRenderer.removeListener('desktop-action',handler);},onQuickChat:callback=>{const handler=(_event,text)=>callback(text);ipcRenderer.on('desktop-quick-chat',handler);return()=>ipcRenderer.removeListener('desktop-quick-chat',handler);}},
  auth: {
    getToken: origin => ipcRenderer.invoke('auth-get-token', origin),
    saveToken: (origin, token) => ipcRenderer.invoke('auth-save-token', { origin, token })
  },
  notifications: {
    show: data => ipcRenderer.invoke('desktop-notify', data),
    badge: count => ipcRenderer.invoke('desktop-badge', count),
    onOpen: callback => {
      const handler = (_event, route) => callback(route);
      ipcRenderer.on('notification-open', handler);
      return () => ipcRenderer.removeListener('notification-open', handler);
    }
  },
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  getScreenSources: () => ipcRenderer.invoke('get-screen-sources'),
  getAssistanceSource: (sessionId,displayId) => ipcRenderer.invoke('get-assistance-screen-source',{sessionId,displayId}),
  prepareDisplayCapture: (sourceId, audio) => ipcRenderer.invoke('prepare-display-capture', { sourceId, audio }),

  log: (type, message, meta) => ipcRenderer.invoke('write-desktop-log', { type, message, meta }),
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  getUpdateState: () => ipcRenderer.invoke('get-update-state'),
  onUpdateState: callback => {
    const handler = (_event, state) => callback(state);
    ipcRenderer.on('update-state', handler);
    return () => ipcRenderer.removeListener('update-state', handler);
  },
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
  isAvailable: process.platform === 'win32',
  getDisplays: () => ipcRenderer.invoke('get-desktop-displays'),
  setAuthorizedSession: (sessionId, guestId, displayId, guestName, allowClipboard=false) => ipcRenderer.invoke('interaction-set-authorized-session', { sessionId, guestId, displayId, guestName, allowClipboard }),
  heartbeat: (sessionId) => ipcRenderer.invoke('interaction-heartbeat', { sessionId }),
  activateSession: (sessionId, guestId, token) => ipcRenderer.invoke('interaction-activate-session', { sessionId, guestId, token }),
  getStatus: () => ipcRenderer.invoke('interaction-native-status'),
  onRevoked: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('interaction-native-revoked', handler);
    return () => ipcRenderer.removeListener('interaction-native-revoked', handler);
  },
  revokeSession: () => ipcRenderer.invoke('interaction-revoke-session'),
  movePointer: (sessionId, displayId, normX, normY, credentials) => ipcRenderer.invoke('interaction-move-pointer', { sessionId, displayId, normX, normY, credentials }),
  pointerDown: (sessionId, button, displayId, normX, normY, credentials) => ipcRenderer.invoke('interaction-pointer-down', { sessionId, button, displayId, normX, normY, credentials }),
  pointerUp: (sessionId, button, displayId, normX, normY, credentials) => ipcRenderer.invoke('interaction-pointer-up', { sessionId, button, displayId, normX, normY, credentials }),
  scroll: (sessionId, deltaY, deltaX, displayId, normX, normY, credentials) => ipcRenderer.invoke('interaction-scroll', { sessionId, deltaY, deltaX, displayId, normX, normY, credentials }),
  keyDown: (sessionId, key, code, credentials) => ipcRenderer.invoke('interaction-key-down', { sessionId, key, code, credentials }),
  keyUp: (sessionId, key, code, credentials) => ipcRenderer.invoke('interaction-key-up', { sessionId, key, code, credentials }),
  clipboardRead: (sessionId,credentials) => ipcRenderer.invoke('interaction-clipboard-read',{sessionId,credentials}),
  clipboardWrite: (sessionId,text,credentials) => ipcRenderer.invoke('interaction-clipboard-write',{sessionId,text,credentials}),
  textInput: (sessionId, text, credentials) => ipcRenderer.invoke('interaction-text', { sessionId, text, credentials })
});

