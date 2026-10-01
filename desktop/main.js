import { app, BrowserWindow, ipcMain, desktopCapturer } from 'electron';
import path from 'path';
import fs from 'fs';
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

    autoUpdater.on('checking-for-update', () => {
      logApp('AutoUpdater: Verificando novas versões no GitHub Releases...');
    });

    autoUpdater.on('update-available', (info) => {
      logApp('AutoUpdater: Nova atualização disponível!', { version: info.version });
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('update-available', info);
      }
    });

    autoUpdater.on('update-not-available', (info) => {
      logApp('AutoUpdater: Nenhuma atualização pendente. Versão atual é a mais recente.', { version: info.version });
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

