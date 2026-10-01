import { app, BrowserWindow, ipcMain, desktopCapturer, screen } from 'electron';
import path from 'path';
import fs from 'fs';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow = null;

// Diretório e arquivos de log em %AppData%/MeuApp/logs/
const logsDir = path.join(app.getPath('userData'), 'logs');
if (!fs.existsSync(logsDir)) {
  try {
    fs.mkdirSync(logsDir, { recursive: true });
  } catch (e) {
    console.error('Falha ao criar pasta de logs:', e);
  }
}

const appLogPath = path.join(logsDir, 'app.log');
const networkLogPath = path.join(logsDir, 'network.log');

function writeLog(filePath, category, message, meta = null) {
  try {
    const timestamp = new Date().toISOString();
    let line = `[${timestamp}] [${category}] ${message}`;
    if (meta) {
      // Sanitização estrita: nunca logar dados sensíveis
      const safeMeta = { ...meta };
      delete safeMeta.token;
      delete safeMeta.password;
      delete safeMeta.credential;
      delete safeMeta.cookie;
      line += ` | ${JSON.stringify(safeMeta)}`;
    }
    line += '\n';
    fs.appendFileSync(filePath, line, 'utf8');
  } catch (err) {
    console.error('Erro ao escrever no arquivo de log:', err);
  }
}

export function logApp(message, meta = null) {
  writeLog(appLogPath, 'APP', message, meta);
}

export function logNetwork(message, meta = null) {
  writeLog(networkLogPath, 'NETWORK', message, meta);
}

// Log de inicialização do Desktop
logApp('Inicialização do processo principal Electron', {
  version: app.getVersion(),
  isPackaged: app.isPackaged,
  nodeVersion: process.versions.node,
  electronVersion: process.versions.electron,
  platform: process.platform,
  arch: process.arch
});

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 940,
    minHeight: 600,
    backgroundColor: '#313338',
    frame: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true
    }
  });

  const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

  if (isDev && process.env.VITE_DEV_SERVER_URL) {
    logApp('Carregando URL de desenvolvimento Vite', { url: process.env.VITE_DEV_SERVER_URL });
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    const indexPath = path.join(__dirname, '../client/dist/index.html');
    logApp('Carregando bundle de produção embutido', { indexPath });
    mainWindow.loadFile(indexPath);
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Obter versão do aplicativo
ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});

// Bridge IPC segura para fontes de tela
ipcMain.handle('get-screen-sources', async () => {

  try {
    const sources = await desktopCapturer.getSources({
      types: ['window', 'screen'],
      thumbnailSize: { width: 320, height: 180 },
      fetchWindowIcons: true
    });

    return sources.map(source => ({
      id: source.id,
      name: source.name,
      display_id: source.display_id || null,
      thumbnail: source.thumbnail.toDataURL(),
      appIcon: source.appIcon ? source.appIcon.toDataURL() : null
    }));
  } catch (error) {
    logApp('Falha ao obter fontes desktopCapturer', { error: error.message });
    return [];
  }
});

// Bridge IPC segura para gravação de logs a partir do frontend
ipcMain.handle('write-desktop-log', (event, { type, message, meta }) => {
  if (type === 'network') {
    logNetwork(message, meta);
  } else {
    logApp(message, meta);
  }
  return true;
});

// ============================================================================
// CONTROLE REMOTO NATIVO DESKTOP (NativeDesktopInteractionTarget & Process Host)
// ============================================================================
let nativeInputProc = null;
let currentAuthorizedSession = null; // { sessionId, hostSocketId, guestId }

function ensureNativeInputProc() {
  if (nativeInputProc && !nativeInputProc.killed) {
    return nativeInputProc;
  }

  let exePath = path.join(__dirname, 'NativeInputHost.exe');
  if (!fs.existsSync(exePath) && process.resourcesPath) {
    const resourcePath = path.join(process.resourcesPath, 'desktop', 'NativeInputHost.exe');
    if (fs.existsSync(resourcePath)) {
      exePath = resourcePath;
    }
  }

  if (!fs.existsSync(exePath)) {
    console.error('[Interaction] NativeInputHost.exe não encontrado em:', exePath);
    return null;
  }


  try {
    nativeInputProc = spawn(exePath, [], {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true
    });

    nativeInputProc.stdout.on('data', (data) => {
      const msg = data.toString().trim();
      // Silencioso ou apenas log resumido de DEV
      if (msg.startsWith('ERR')) {
        console.warn('[Interaction] NativeInputHost erro:', msg);
      }
    });

    nativeInputProc.stderr.on('data', (data) => {
      console.warn('[Interaction] NativeInputHost stderr:', data.toString().trim());
    });

    nativeInputProc.on('exit', (code) => {
      console.log(`[Interaction] NativeInputHost encerrado com código ${code}`);
      nativeInputProc = null;
    });

    return nativeInputProc;
  } catch (err) {
    console.error('[Interaction] Falha ao iniciar NativeInputHost:', err);
    return null;
  }
}

function sendNativeCommand(cmd) {
  const proc = ensureNativeInputProc();
  if (proc && proc.stdin && proc.stdin.writable) {
    try {
      proc.stdin.write(cmd + '\n');
    } catch (e) {
      console.error('[Interaction] Erro ao enviar comando para NativeInputHost:', e);
    }
  }
}

// Obter displays disponíveis do Electron para CoordinateMapper
ipcMain.handle('get-desktop-displays', () => {
  try {
    const displays = screen.getAllDisplays();
    return displays.map((d, index) => ({
      id: d.id,
      index,
      bounds: d.bounds,
      scaleFactor: d.scaleFactor || 1,
      isPrimary: d.id === screen.getPrimaryDisplay().id
    }));
  } catch (err) {
    console.error('[Interaction] Erro ao listar telas:', err);
    return [];
  }
});

// Consentimento explícito: autorizar sessão no Main Process
ipcMain.handle('interaction-set-authorized-session', (event, { sessionId, guestId }) => {
  if (!sessionId) {
    currentAuthorizedSession = null;
    console.log('[Interaction] Sessão revogada / desautorizada no Main Process');
    return { success: true };
  }
  currentAuthorizedSession = { sessionId, guestId, authorizedAt: Date.now() };
  console.log(`[Interaction] Sessão autorizada no Main Process: ${sessionId} (guest: ${guestId})`);
  ensureNativeInputProc();
  return { success: true };
});

// Revogação imediata
ipcMain.handle('interaction-revoke-session', () => {
  console.log('[Interaction] Session revoked - Desativando controle nativo');
  currentAuthorizedSession = null;
  return { success: true };
});

// 1. Move Pointer
ipcMain.handle('interaction-move-pointer', (event, { sessionId, displayId, normX, normY }) => {
  if (!currentAuthorizedSession || currentAuthorizedSession.sessionId !== sessionId) {
    console.log('[Interaction] Event rejected: session not authorized');
    return false;
  }

  if (typeof normX !== 'number' || typeof normY !== 'number' || isNaN(normX) || isNaN(normY)) {
    return false;
  }

  const clampedX = Math.max(0, Math.min(1, normX));
  const clampedY = Math.max(0, Math.min(1, normY));

  // Resolver limites da tela compartilhada
  const displays = screen.getAllDisplays();
  let targetDisplay = null;

  if (displayId) {
    targetDisplay = displays.find(d => String(d.id) === String(displayId));
  }
  if (!targetDisplay) {
    targetDisplay = screen.getPrimaryDisplay();
  }

  const { x: dX, y: dY, width: dW, height: dH } = targetDisplay.bounds;
  const absX = Math.round(dX + (clampedX * dW));
  const absY = Math.round(dY + (clampedY * dH));

  sendNativeCommand(`MOVE ${absX} ${absY}`);
  return true;
});

// 2. Pointer Down
ipcMain.handle('interaction-pointer-down', (event, { sessionId, button, displayId, normX, normY }) => {
  if (!currentAuthorizedSession || currentAuthorizedSession.sessionId !== sessionId) {
    console.log('[Interaction] Event rejected: session not authorized');
    return false;
  }

  if (typeof button !== 'number' || button < 0 || button > 2) {
    return false; // Aceita apenas 0 (left), 1 (middle), 2 (right)
  }

  const btnName = button === 0 ? 'left' : button === 1 ? 'middle' : 'right';
  console.log(`[Interaction] PointerDown ${btnName}`);

  if (typeof normX === 'number' && typeof normY === 'number') {
    const displays = screen.getAllDisplays();
    let targetDisplay = displayId ? displays.find(d => String(d.id) === String(displayId)) : screen.getPrimaryDisplay();
    if (!targetDisplay) targetDisplay = screen.getPrimaryDisplay();

    const { x: dX, y: dY, width: dW, height: dH } = targetDisplay.bounds;
    const absX = Math.round(dX + (Math.max(0, Math.min(1, normX)) * dW));
    const absY = Math.round(dY + (Math.max(0, Math.min(1, normY)) * dH));
    sendNativeCommand(`MOUSEDOWN ${button} ${absX} ${absY}`);
  } else {
    sendNativeCommand(`MOUSEDOWN ${button}`);
  }

  return true;
});

// 3. Pointer Up
ipcMain.handle('interaction-pointer-up', (event, { sessionId, button, displayId, normX, normY }) => {
  if (!currentAuthorizedSession || currentAuthorizedSession.sessionId !== sessionId) {
    return false;
  }

  if (typeof button !== 'number' || button < 0 || button > 2) {
    return false;
  }

  const btnName = button === 0 ? 'left' : button === 1 ? 'middle' : 'right';
  console.log(`[Interaction] PointerUp ${btnName}`);

  if (typeof normX === 'number' && typeof normY === 'number') {
    const displays = screen.getAllDisplays();
    let targetDisplay = displayId ? displays.find(d => String(d.id) === String(displayId)) : screen.getPrimaryDisplay();
    if (!targetDisplay) targetDisplay = screen.getPrimaryDisplay();

    const { x: dX, y: dY, width: dW, height: dH } = targetDisplay.bounds;
    const absX = Math.round(dX + (Math.max(0, Math.min(1, normX)) * dW));
    const absY = Math.round(dY + (Math.max(0, Math.min(1, normY)) * dH));
    sendNativeCommand(`MOUSEUP ${button} ${absX} ${absY}`);
  } else {
    sendNativeCommand(`MOUSEUP ${button}`);
  }

  return true;
});

// 4. Scroll
ipcMain.handle('interaction-scroll', (event, { sessionId, deltaY, deltaX }) => {
  if (!currentAuthorizedSession || currentAuthorizedSession.sessionId !== sessionId) {
    return false;
  }

  let dY = typeof deltaY === 'number' ? deltaY : 0;
  let dX = typeof deltaX === 'number' ? deltaX : 0;

  // Clamping seguro contra valores absurdos
  dY = Math.max(-1200, Math.min(1200, dY));
  dX = Math.max(-1200, Math.min(1200, dX));

  // Inversão do delta para corresponder à roda de rolagem do Windows
  // No Windows WHEEL: positivo rola para cima/frente, negativo para baixo
  // No DOM mousewheel: deltaY positivo rola para baixo
  const winDeltaY = -Math.round(dY);
  const winDeltaX = Math.round(dX);

  console.log(`[Interaction] Scroll deltaY=${winDeltaY}`);
  sendNativeCommand(`SCROLL ${winDeltaY} ${winDeltaX}`);
  return true;
});

// 5. Keyboard KeyDown
ipcMain.handle('interaction-key-down', (event, { sessionId, key }) => {
  if (!currentAuthorizedSession || currentAuthorizedSession.sessionId !== sessionId) {
    return false;
  }

  if (typeof key !== 'string' || key.length === 0 || key.length > 20) {
    return false;
  }

  // Bloqueio de combinações sensíveis ou perigosas
  const upper = key.toUpperCase();
  if (upper === 'CTRL+ALT+DELETE' || upper === 'ALT+F4') {
    console.warn('[Interaction] Sequência privilegiada bloqueada:', key);
    return false;
  }

  sendNativeCommand(`KEYDOWN ${key}`);
  return true;
});

// 6. Keyboard KeyUp
ipcMain.handle('interaction-key-up', (event, { sessionId, key }) => {
  if (!currentAuthorizedSession || currentAuthorizedSession.sessionId !== sessionId) {
    return false;
  }

  if (typeof key !== 'string' || key.length === 0 || key.length > 20) {
    return false;
  }

  sendNativeCommand(`KEYUP ${key}`);
  return true;
});


// Configuração do Sistema de Auto-Update
let autoUpdater = null;

async function setupAutoUpdater() {
  if (!app.isPackaged) {
    logApp('AutoUpdater desativado em modo de desenvolvimento.');
    return;
  }

  try {
    const updaterModule = await import('electron-updater');
    autoUpdater = updaterModule.autoUpdater || updaterModule.default?.autoUpdater;

    if (!autoUpdater) {
      logApp('Falha ao instanciar autoUpdater da biblioteca electron-updater');
      return;
    }

    autoUpdater.logger = {
      info: (msg) => logApp(`[AutoUpdater INFO] ${msg}`),
      warn: (msg) => logApp(`[AutoUpdater WARN] ${msg}`),
      error: (msg) => logApp(`[AutoUpdater ERROR] ${msg}`)
    };

    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.disableDifferentialDownload = true;
    autoUpdater.disableWebInstaller = true;

    autoUpdater.on('checking-for-update', () => {
      logApp('AutoUpdater: Verificando novas versões no GitHub Releases...');
    });

    autoUpdater.on('update-available', (info) => {
      logApp('AutoUpdater: Nova atualização disponível!', { version: info.version });
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('update-available', info);
      }
      // Garante explicitamente que o download seja disparado
      autoUpdater.downloadUpdate().catch((err) => {
        logApp('Erro ao iniciar download automático da atualização:', { error: err?.message });
      });
    });

    autoUpdater.on('update-not-available', (info) => {
      logApp('AutoUpdater: Nenhuma atualização pendente. Versão atual é a mais recente.', { version: info?.version });
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('update-not-available', info);
      }
    });


    autoUpdater.on('download-progress', (progressObj) => {
      logApp('AutoUpdater: Baixando atualização...', {
        percent: Math.round(progressObj.percent),
        bytesPerSecond: progressObj.bytesPerSecond
      });
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('update-downloading', {
          percent: Math.round(progressObj.percent)
        });
      }
    });

    autoUpdater.on('update-downloaded', (info) => {
      logApp('AutoUpdater: Atualização baixada com sucesso!', { version: info.version });
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('update-downloaded', info);
      }
    });

    autoUpdater.on('error', (err) => {
      logApp('AutoUpdater: Erro durante verificação ou download', { error: err?.message || String(err) });
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('update-error', { message: err?.message || 'Erro ao buscar atualização' });
      }
    });

    // Dispara a primeira checagem após 5 segundos da abertura
    setTimeout(() => {
      try {
        autoUpdater.checkForUpdatesAndNotify().catch((e) => {
          logApp('Falha silenciosa ao verificar atualizações automáticas:', { error: e.message });
        });
      } catch (e) {
        logApp('Erro ao iniciar checkForUpdatesAndNotify:', { error: e.message });
      }
    }, 5000);

    // Repete a verificação a cada 15 minutos em background
    setInterval(() => {
      try {
        autoUpdater.checkForUpdates().catch((e) => {
          logApp('Falha na checagem periódica de atualizações:', { error: e.message });
        });
      } catch (e) {}
    }, 15 * 60 * 1000);

  } catch (err) {
    logApp('Erro crítico ao inicializar autoUpdater:', { error: err.message });
  }
}

ipcMain.handle('check-for-updates', async () => {
  if (!autoUpdater) {
    return { status: 'not-configured' };
  }
  try {
    const res = await autoUpdater.checkForUpdates();
    return { status: 'ok', updateInfo: res?.updateInfo };
  } catch (err) {
    return { status: 'error', error: err.message };
  }
});

ipcMain.handle('restart-and-install-update', () => {
  if (autoUpdater) {
    logApp('Reiniciando aplicativo para aplicar atualização instalada...');
    autoUpdater.quitAndInstall();
  }
  return true;
});

ipcMain.handle('start-download-update', async () => {
  if (autoUpdater) {
    logApp('Iniciando download da atualização manualmente pelo usuário...');
    try {
      await autoUpdater.downloadUpdate();
      return { status: 'ok' };
    } catch (e) {
      logApp('Erro ao iniciar downloadUpdate:', { error: e.message });
      return { status: 'error', error: e.message };
    }
  }
  return { status: 'not-configured' };
});

// Captura de exceções não tratadas no processo principal
process.on('uncaughtException', (error) => {
  logApp('Exceção não tratada no processo principal', {
    message: error.message,
    stack: error.stack
  });
});

process.on('unhandledRejection', (reason) => {
  logApp('Promise rejeitada não tratada no processo principal', {
    reason: String(reason)
  });
});

app.whenReady().then(() => {
  createWindow();
  setupAutoUpdater();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  logApp('Todas as janelas foram fechadas. Encerrando Electron.');
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

