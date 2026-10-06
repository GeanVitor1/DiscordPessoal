import { app, BrowserWindow, ipcMain, desktopCapturer, screen, dialog, globalShortcut, shell } from 'electron';
import path from 'path';
import { SessionGuard } from './SessionGuard.js';
import { redact } from './logging.js';
import { installDesktopServices } from './services.js';
import { UpdateController } from './updates.js';
import { normalizedToPhysical } from './coordinates.js';
import { nativeFailure } from './native-errors.js';
import fs from 'fs';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Use software composition on Windows: an idle chat window must not contend
// with the desktop cursor/compositor or graphics drivers for GPU scheduling.
if (process.platform === 'win32') app.disableHardwareAcceleration();

let mainWindow = null;
// One main process per profile; Chromium renderer/GPU/utility child processes
// remain normal. Isolated test profiles and accounts can still run separately.
if (!app.requestSingleInstanceLock()) app.exit(0);
app.on('second-instance', () => {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show(); mainWindow.focus();
});
let pendingDisplayCapture = null;
function handleTrusted(channel, handler) {
  ipcMain.handle(channel, (event, ...args) => {
    if (!trusted(event)) throw new Error('IPC origin rejected');
    return handler(event, ...args);
  });
}
function installDisplayCapture() {
  if (typeof mainWindow.webContents.session.setDisplayMediaRequestHandler === 'function') {
    mainWindow.webContents.session.setDisplayMediaRequestHandler(async (request, callback) => {
      const selected = pendingDisplayCapture;
      pendingDisplayCapture = null;
      if (!selected || Date.now() > selected.deadline || request.frame !== mainWindow?.webContents.mainFrame || !request.videoRequested) { callback({}); return; }
      try {
        const sources = await desktopCapturer.getSources({ types: ['screen', 'window'], thumbnailSize: { width: 0, height: 0 } });
        const source = sources.find(s => s.id === selected.sourceId);
        if (!source || request.frame !== mainWindow?.webContents.mainFrame) { callback({}); return; }
        callback({ video: source, ...(selected.audio && request.audioRequested && process.platform === 'win32' ? { audio: 'loopback' } : {}) });
      } catch (error) { logApp('Captura desktop recusada', { error: error.message }); callback({}); }
    });
  }
}
installDesktopServices(handleTrusted, () => mainWindow);
app.setAppUserModelId('com.meuapp.comunicacao');

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
      const safeMeta = redact(meta);
      line += ` | ${JSON.stringify(safeMeta)}`;
    }
    line += '\n';
    if (fs.existsSync(filePath) && fs.statSync(filePath).size > 5 * 1024 * 1024) {
      if (fs.existsSync(filePath + '.1')) fs.unlinkSync(filePath + '.1');
      fs.renameSync(filePath, filePath + '.1');
    }
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
  arch: process.arch,
  graphicsMode: process.platform === 'win32' ? 'software' : 'default',
  singleInstance: app.hasSingleInstanceLock()
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

  installDisplayCapture();
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

  // Monitora crash do processo do renderizador ou problemas de carregamento
  mainWindow.webContents.on('render-process-gone', (event, details) => {
    guard.revoke('Renderer encerrou');
    logApp('PROCESSO RENDERIZADOR MORREU/CRASH', { details });
    console.error('CRASH RENDERER:', details);
  });

  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    logApp('FALHA AO CARREGAR PAGINA', { errorCode, errorDescription });
  });

  mainWindow.webContents.on('did-start-navigation', () => { pendingDisplayCapture = null; guard.revoke('Navegação'); });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url).catch(error => logApp('Falha ao abrir link', { error: error.message }));
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url !== mainWindow.webContents.getURL()) event.preventDefault();
  });
  mainWindow.on('close', () => guard.revoke('Aplicativo fechando'));
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Obter versão do aplicativo
handleTrusted('get-app-version', () => {
  return app.getVersion();
});

// Bridge IPC segura para fontes de tela
handleTrusted('get-screen-sources', async () => {
  try {
    // Captura com tamanho de thumbnail leve e otimizado (evita travar a thread e demorar)
    const sources = await desktopCapturer.getSources({
      types: ['screen', 'window'],
      thumbnailSize: { width: 240, height: 135 },
      fetchWindowIcons: true
    });

    // Filtra janelas invisíveis, sem nome ou elementos internos do sistema/Electron que não devem ser compartilhados
    const filteredSources = sources.filter(source => {
      if (source.id.startsWith('screen:')) return true;

      const name = (source.name || '').trim();
      if (!name) return false;

      // Ignora janelas utilitárias ou do sistema sem interface útil
      const ignoredNames = [
        'Default IME',
        'MSCTFIME UI',
        'Setup',
        'Desktop Window Manager',
        'Program Manager',
        'Windows Input Experience'
      ];
      if (ignoredNames.includes(name)) return false;

      // Descarta fontes cuja thumbnail seja vazia ou 0x0
      if (source.thumbnail && source.thumbnail.isEmpty()) {
        return false;
      }

      return true;
    });

    return filteredSources.map(source => ({
      id: source.id,
      name: source.name,
      display_id: source.display_id || null,
      thumbnail: source.thumbnail.toDataURL(),
      appIcon: source.appIcon && !source.appIcon.isEmpty() ? source.appIcon.toDataURL() : null
    }));
  } catch (error) {
    logApp('Falha ao obter fontes desktopCapturer', { error: error.message });
    return [];
  }
});

handleTrusted('prepare-display-capture', async (event, { sourceId, audio }) => {
  if (typeof mainWindow.webContents.session.setDisplayMediaRequestHandler !== 'function') return { success: false, code: 'UNSUPPORTED' };
  const sources = await desktopCapturer.getSources({ types: ['screen', 'window'], thumbnailSize: { width: 0, height: 0 } });
  if (!sources.some(s => s.id === sourceId) || !trusted(event)) return { success: false, code: 'INVALID_SOURCE' };
  pendingDisplayCapture = { sourceId, audio: audio === true && process.platform === 'win32', deadline: Date.now() + 15000 };
  return { success: true, systemAudio: pendingDisplayCapture.audio };
});

// Bridge IPC segura para gravação de logs a partir do frontend
handleTrusted('write-desktop-log', (event, { type, message, meta }) => {
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
let indicatorWindow = null;
let consentGeneration = 0;
let nativeConsentPending = false;
let nativeCommandId = 0;
const nativePending = new Map();
const nativeStatus = { ipc: 'CONNECTED', nativeHost: 'STOPPED', privilege: 'STANDARD', lastInput: null, lastSequence: null, lastNativeAck: null, lastNativePosition: null, lastError: null, lastErrorDetail:null };
const devDiagnostics = () => !app.isPackaged || process.env.MEUAPP_DIAGNOSTICS === 'true';
function traceNative(stage, details) { if (devDiagnostics()) logApp(`[ASSIST][${stage}]`, details); }
const heldKeys = new Set();
const heldButtons = new Set();
const guard = new SessionGuard({ onRevoke: (old, reason) => {
  ++consentGeneration;
  // Release all remotely held inputs before closing the helper.
  if (nativeInputProc?.stdin?.writable) {
    for (const key of heldKeys) nativeInputProc.stdin.write(`KEYUP ${key}\n`);
    for (const button of heldButtons) nativeInputProc.stdin.write(`MOUSEUP ${button}\n`);
  }
  heldKeys.clear(); heldButtons.clear();
  for (const item of nativePending.values()) { clearTimeout(item.timer); item.resolve({ success: false, nativeAck: 'ERROR', code: 'REVOKED', sequence: item.sequence }); }
  nativePending.clear();
  if (nativeInputProc?.stdin?.writable) nativeInputProc.stdin.end('EXIT\n');
  nativeInputProc = null;
  nativeStatus.nativeHost = 'STOPPED';
  globalShortcut.unregister('Control+Alt+Escape');
  if (indicatorWindow && !indicatorWindow.isDestroyed()) indicatorWindow.destroy();
  indicatorWindow = null;
  if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed()) mainWindow.webContents.send('interaction-native-revoked', { sessionId: old.sessionId, reason, nativeStatus: { ...nativeStatus, session: 'INACTIVE' } });
} });
const trusted = event => mainWindow && event.sender === mainWindow.webContents && event.senderFrame === mainWindow.webContents.mainFrame;
function accepts(event, sessionId, displayId) { return trusted(event) && guard.accepts(sessionId, event.sender.id, displayId); }
function showIndicator(guestName) {
  indicatorWindow = new BrowserWindow({ width: 550, height: 90, frame: false, resizable: false, alwaysOnTop: true,
    show: false, skipTaskbar: false, webPreferences: { preload: path.join(__dirname, 'assist-preload.cjs'), sandbox: true, contextIsolation: true, nodeIntegration: false } });
  indicatorWindow.once('ready-to-show', () => indicatorWindow?.showInactive());
  const safeName = String(guestName).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  indicatorWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(`<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'"><style>body{margin:0;background:#a32028;color:white;font:14px system-ui;padding:14px}button{float:right;padding:9px;border:0;border-radius:4px;font-weight:700;cursor:pointer}small{display:block;margin-top:6px}</style><button onclick="window.assistance.stop()">Encerrar assistência</button><strong>Assistência ativa — ${safeName}</strong><small>Mouse e teclado autorizados • Ctrl+Alt+Esc encerra</small></html>`));
  indicatorWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  indicatorWindow.on('close', () => guard.revoke('Indicador fechado'));
  globalShortcut.register('Control+Alt+Escape', () => guard.revoke('Atalho de emergência'));
}

async function ensureNativeInputProc(elevated = false) {
  if (nativeInputProc && nativeInputProc.exitCode === null && !nativeInputProc.killed) {
    return await nativeInputProc.readyPromise ? nativeInputProc : null;
  }

  let exePath = path.join(__dirname, 'NativeInputHost.exe');
  exePath = exePath.replace('app.asar' + path.sep, 'app.asar.unpacked' + path.sep);
  if (!fs.existsSync(exePath) && process.resourcesPath) {
    const resourcePath = path.join(process.resourcesPath, 'desktop', 'NativeInputHost.exe');
    if (fs.existsSync(resourcePath)) {
      exePath = resourcePath;
    }
  }

  if (!fs.existsSync(exePath)) {
    nativeStatus.nativeHost='ERROR';nativeStatus.lastError='MISSING_HELPER';
    logApp('Helper nativo indisponível', {code:'MISSING_HELPER'});
    console.error('[Interaction] NativeInputHost.exe não encontrado em:', exePath);
    return null;
  }


  try {
    const proc = spawn(exePath, elevated ? ['--elevate'] : [], {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true
    });

    nativeInputProc = proc;
    nativeStatus.nativeHost = 'STARTING';
    nativeStatus.privilege = elevated ? 'ADMINISTRATOR' : 'STANDARD';
    nativeStatus.lastInput = null; nativeStatus.lastSequence = null; nativeStatus.lastNativeAck = null; nativeStatus.lastError = null;
    let resolveReady;
    proc.readyPromise = new Promise(resolve => { resolveReady = resolve; });
    const readyTimer = setTimeout(() => { if (nativeInputProc === proc) nativeStatus.lastError = 'START_TIMEOUT'; resolveReady(false); if (proc.stdin.writable) proc.stdin.end('EXIT\n'); }, elevated ? 25000 : 4000);
    proc.stdin.on('error', error => { if (nativeInputProc !== proc) return; traceNative('IPC', { code: error.code }); guard.revoke('Conexão nativa perdida'); });
    proc.on('error', error => { clearTimeout(readyTimer); resolveReady(false); logApp('Falha no helper nativo', { error: error.message }); if (nativeInputProc === proc) guard.revoke('Helper indisponível'); });
    let helperOutput='';
    proc.stdout.on('data', data => {
      if (nativeInputProc !== proc) return;
      helperOutput+=data.toString();
      let newline;
      while((newline=helperOutput.indexOf('\n'))>=0) {
        const line=helperOutput.slice(0,newline).trim();helperOutput=helperOutput.slice(newline+1);
        if (line === 'READY') { clearTimeout(readyTimer); nativeStatus.nativeHost = 'RUNNING'; resolveReady(true); traceNative('NATIVE', { state: 'RUNNING' }); continue; }
        const ack = /^ACK (\d+) (OK|ERR)\s*(.*)$/.exec(line);
        if (ack) {
          const item = nativePending.get(Number(ack[1]));
          if (!item || item.proc !== proc) continue;
          nativePending.delete(Number(ack[1])); clearTimeout(item.timer);
          traceNative('NATIVE', { sequence: item.sequence, command: item.command, state: 'RECEIVED' });
          const success = ack[2] === 'OK';
          const position = item.command === 'MOVE' && /^MOVE (-?\d+) (-?\d+)$/.exec(ack[3]);
          if(position)nativeStatus.lastNativePosition={x:Number(position[1]),y:Number(position[2])};
          const capabilities = item.command === 'STATUS' && /^STATUS (28|40) (\d+)$/.exec(ack[3]);
          if (capabilities) nativeStatus.privilege = Number(capabilities[2]) >= 0x3000 ? 'ADMINISTRATOR' : 'STANDARD';
          const failure = nativeFailure(ack[3]);
          nativeStatus.lastNativeAck = success ? 'OK' : 'ERROR'; nativeStatus.lastError = success ? null : failure.code;
          nativeStatus.lastErrorDetail=success ? null:String(ack[3]).slice(0,160);
          traceNative('WINDOWS', { sequence: item.sequence, command: item.command, result: nativeStatus.lastNativeAck, error: nativeStatus.lastError });
          if (!success) logApp('Comando nativo rejeitado pelo Windows', { command: item.command, sequence: item.sequence, code: failure.code, recoverable: failure.recoverable, privilege: nativeStatus.privilege });
          item.resolve({ success, nativeAck: nativeStatus.lastNativeAck, sequence: item.sequence, ...(success ? {} : failure) });
          if (!success && !failure.recoverable) guard.revoke(`Entrada nativa falhou (${failure.code})`);
        } else if (line.startsWith('ERR')) {
          const failure = nativeFailure(line.slice(4));
          nativeStatus.lastError = failure.code;
          logApp('Native input failed', { code: failure.code });
          clearTimeout(readyTimer); resolveReady(false);
          guard.revoke(`Entrada nativa falhou (${failure.code})`);
        }
      }
      if(helperOutput.length>4096) {helperOutput='';guard.revoke('Resposta nativa invalida');}
    });

    proc.stderr.on('data', (data) => {
      console.warn('[Interaction] NativeInputHost stderr:', data.toString().trim());
    });

    proc.on('exit', (code) => {
      clearTimeout(readyTimer); resolveReady(false);
      console.log(`[Interaction] NativeInputHost encerrado com código ${code}`);
      if (nativeInputProc === proc) { nativeInputProc = null; guard.revoke('Helper encerrou'); }
    });

    if (!await proc.readyPromise) {
      if (proc.stdin.writable) proc.stdin.end('EXIT\n');
      if(nativeInputProc===proc) { nativeInputProc=null; nativeStatus.nativeHost='ERROR'; }
      return null;
    }
    return proc;
  } catch (err) {
    console.error('[Interaction] Falha ao iniciar NativeInputHost:', err);
    return null;
  }
}

function sendNativeCommand(cmd, sequence) {
  const proc = nativeInputProc;
  if (proc && proc.stdin && proc.stdin.writable) {
    const id = ++nativeCommandId, command = cmd.split(' ')[0];
    nativeStatus.lastInput = command; nativeStatus.lastSequence = sequence;
    nativeStatus.lastNativeAck='PENDING';
    traceNative('IPC', { sequence, command, state: 'FORWARDED' });
    return new Promise(resolve => {
      const timer = setTimeout(() => { nativePending.delete(id); nativeStatus.lastNativeAck='ERROR'; nativeStatus.lastError='ACK_TIMEOUT'; resolve({success:false,nativeAck:'ERROR',code:'ACK_TIMEOUT',sequence}); guard.revoke('Helper sem resposta'); }, 4000);
      nativePending.set(id,{ resolve, timer, sequence, command, proc });
      // write(false) is backpressure, not rejection. Success requires the helper's ACK.
      proc.stdin.write(`SEQ ${id} ${cmd}\n`, error => { if(error){clearTimeout(timer);nativePending.delete(id);resolve({success:false,nativeAck:'ERROR',code:'PIPE_ERROR',sequence});guard.revoke('Conexão nativa perdida');} });
    });
  }
  return Promise.resolve({success:false,nativeAck:'ERROR',code:'NOT_RUNNING',sequence});
}

// Obter displays disponíveis do Electron para CoordinateMapper
handleTrusted('get-desktop-displays', () => {
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

// Privileged commands accept only the app's main frame and one consented display.
handleTrusted('interaction-set-authorized-session', async (event, { sessionId, guestId, displayId, guestName }) => {
  if (!trusted(event) || process.platform !== 'win32' || typeof sessionId !== 'string' || !/^[\w-]{8,100}$/.test(sessionId) || typeof guestId !== 'string') return { success: false };
  const display = screen.getAllDisplays().find(d => String(d.id) === String(displayId));
  if (!display || guard.session || nativeConsentPending) return { success: false };
  nativeConsentPending = true;
  try {
  const generation = ++consentGeneration;
  const result = await dialog.showMessageBox(mainWindow, { type: 'question', title: 'Autorizar assistência temporária',
    message: `${String(guestName || 'Participante').slice(0, 100)} solicita interação com este computador.`,
    detail: `Esta sessão possui captura e conexão próprias. Mouse e teclado na tela ${display.id}. Parar o compartilhamento não encerra a assistência. Encerre pelo indicador ou por Ctrl+Alt+Esc; perder a conexão também remove o controle.`,
    buttons: ['Recusar', 'Autorizar'], defaultId: 0, cancelId: 0, noLink: true,
    checkboxLabel: 'Permitir controle de programas como administrador (o Windows pedirá confirmação)', checkboxChecked: false });
  if (result.response !== 1 || generation !== consentGeneration || !trusted(event)) return { success: false };
  if (!await ensureNativeInputProc(result.checkboxChecked === true)) return { success: false, code: nativeStatus.lastError || 'NATIVE_UNAVAILABLE' };
  if (generation !== consentGeneration || !trusted(event)) { nativeInputProc?.stdin.end('EXIT\n'); nativeInputProc=null; return {success:false}; }
  const capabilities = await sendNativeCommand('STATUS', -1);
  if (!capabilities.success || generation !== consentGeneration || !trusted(event)) {
    nativeInputProc?.stdin.end('EXIT\n'); nativeInputProc=null;
    return { success: false, code: capabilities.code || 'NATIVE_UNAVAILABLE' };
  }
  guard.authorize({ sessionId, guestId, displayId, ownerId: event.sender.id, preparationMs: 30000 });
  nativeStatus.lastNativePosition=null; nativeStatus.lastInput=null; nativeStatus.lastSequence=null; nativeStatus.lastNativeAck=null;
  showIndicator(guestName || 'Participante');
  return { success: true };
  } finally { nativeConsentPending = false; }
});
handleTrusted('interaction-heartbeat', (event, { sessionId }) => trusted(event) && guard.heartbeat(sessionId, event.sender.id));
handleTrusted('interaction-activate-session', (event, { sessionId, guestId, token }) => guard.activate(sessionId,event.sender.id,guestId,token,25000));
handleTrusted('interaction-native-status', () => ({ ...nativeStatus, session: guard.session?.active ? 'ACTIVE' : guard.session ? 'AUTHORIZED' : 'INACTIVE' }));
handleTrusted('interaction-revoke-session', event => {
  if (!trusted(event)) return { success: false };
  ++consentGeneration;
  guard.revoke();
  return { success: true };
});
ipcMain.handle('interaction-stop-from-indicator', event => {
  if (event.sender !== indicatorWindow?.webContents) return false;
  guard.revoke();
  return true;
});
function pointerPosition(event, { sessionId, displayId, normX, normY, credentials }) {
  if (!Number.isFinite(normX) || !Number.isFinite(normY) || normX < 0 || normX > 1 || normY < 0 || normY > 1 || !guard.acceptsInput(sessionId,event.sender.id,displayId,credentials)) return null;
  const display = screen.getAllDisplays().find(d => String(d.id) === guard.session.displayId);
  if (!display) { guard.revoke('Tela desconectada'); return null; }
  return normalizedToPhysical(screen.dipToScreenRect(null, display.bounds), normX, normY);
}
function rejectNativeInput(event,data,code) {
  const rejection=code || guard.inputRejection(data.sessionId,event.sender.id,data.displayId,data.credentials);
  nativeStatus.lastNativeAck='ERROR';nativeStatus.lastError=rejection;
  traceNative('IPC',{state:'REJECTED',code:rejection,sequence:data.credentials?.sequence});
  return {success:false,nativeAck:'ERROR',code:rejection,sequence:data.credentials?.sequence};
}
handleTrusted('interaction-move-pointer', (event, data) => {
  const point = pointerPosition(event, data);
  return point ? sendNativeCommand(`MOVE ${point.x} ${point.y}`, data.credentials.sequence) : rejectNativeInput(event,data);
});
for (const [channel, command, down] of [['interaction-pointer-down', 'MOUSEDOWN', true], ['interaction-pointer-up', 'MOUSEUP', false]]) {
  handleTrusted(channel, (event, data) => {
    if (!Number.isInteger(data.button) || data.button < 0 || data.button > 2) return rejectNativeInput(event,data,'INVALID_BUTTON');
    const point = pointerPosition(event, data);
    if (!point) return rejectNativeInput(event,data);
    if (down) heldButtons.add(data.button); else heldButtons.delete(data.button);
    return sendNativeCommand(`${command} ${data.button} ${point.x} ${point.y}`, data.credentials.sequence);
  });
}
handleTrusted('interaction-scroll', async (event, data) => {
  const { deltaY, deltaX } = data;
  if (!Number.isFinite(deltaY) || !Number.isFinite(deltaX)) return rejectNativeInput(event,data,'INVALID_SCROLL');
  const point = pointerPosition(event, data); if (!point) return rejectNativeInput(event,data);
  const moved = await sendNativeCommand(`MOVE ${point.x} ${point.y}`, data.credentials.sequence);
  if (!moved.success) return moved;
  if (!guard.accepts(data.sessionId,event.sender.id,data.displayId)) return rejectNativeInput(event,data);
  return sendNativeCommand(`SCROLL ${-Math.round(Math.max(-1200, Math.min(1200, deltaY)))} ${Math.round(Math.max(-1200, Math.min(1200, deltaX)))}`, data.credentials.sequence);
});
for (const [channel, command, down] of [['interaction-key-down', 'KEYDOWN', true], ['interaction-key-up', 'KEYUP', false]]) {
  handleTrusted(channel, (event, data) => {
    let { sessionId,key,code,credentials }=data;
    if (!accepts(event, sessionId)) return rejectNativeInput(event,data);
    if (typeof key !== 'string' || !key || key.length > 20 || /[\r\n\t]/.test(key)) return rejectNativeInput(event,data,'INVALID_KEY');
    if (key === ' ') key = 'Space';
    if (code !== undefined) {
      if (typeof code !== 'string' || !/^[A-Za-z][A-Za-z0-9]{0,24}$/.test(code)) return rejectNativeInput(event,data,'INVALID_KEY');
      key = `Code:${code}`;
    }
    if (key.includes(' ')) return rejectNativeInput(event,data,'INVALID_KEY');
    if (!guard.acceptsInput(sessionId,event.sender.id,undefined,credentials)) return rejectNativeInput(event,data);
    if (down) heldKeys.add(key); else heldKeys.delete(key);
    return sendNativeCommand(`${command} ${key}`, credentials.sequence);
  });
}
handleTrusted('interaction-text', (event, data) => {
  const {sessionId,text,credentials}=data;
  if (!accepts(event, sessionId)) return rejectNativeInput(event,data);
  if (typeof text !== 'string' || !text || text.length > 256 || /[\x00-\x1f\x7f]/.test(text)) return rejectNativeInput(event,data,'INVALID_TEXT');
  if (!guard.acceptsInput(sessionId,event.sender.id,undefined,credentials)) return rejectNativeInput(event,data);
  return sendNativeCommand(`TEXT ${Buffer.from(text, 'utf8').toString('base64')}`, credentials.sequence);
});
app.on('before-quit', () => guard.revoke('Aplicativo encerrando'));
app.whenReady().then(() => {
  const watchdog = setInterval(() => { if (guard.session) guard.accepts(guard.session.sessionId, guard.session.ownerId); }, 500);
  watchdog.unref();
  screen.on('display-removed', () => guard.revoke('Tela removida'));
});

// Configuração do Sistema de Auto-Update
let updateController = new UpdateController(null);
async function setupAutoUpdater() {
  if (!app.isPackaged) return;
  try {
    const module = await import('electron-updater');
    const updater = module.autoUpdater || module.default?.autoUpdater;
    if (!updater) throw new Error('AutoUpdater unavailable');
    updater.logger = { info: msg => logApp('[Updater] ' + msg), warn: msg => logApp('[Updater] ' + msg), error: msg => logApp('[Updater] ' + msg) };
    updateController = new UpdateController(updater, {
      log: logApp,
      publish: state => { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('update-state', state); }
    });
    updateController.start();
  } catch (error) { logApp('Updater initialization failed', { error: error.message }); }
}
handleTrusted('get-update-state', () => updateController.snapshot());
handleTrusted('check-for-updates', () => updateController.check());
handleTrusted('start-download-update', () => updateController.download());
handleTrusted('restart-and-install-update', () => updateController.install());
app.on('will-quit', () => updateController.stop());

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

