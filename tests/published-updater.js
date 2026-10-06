import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

const targetVersion = JSON.parse(await fs.readFile('package.json', 'utf8')).version;
const output = path.resolve(process.env.MEUAPP_TEST_OUTPUT || 'dist');
const previousApp = path.resolve(process.argv[2] || 'artifacts/installer-verification-1.0.15/MeuApp.exe');
const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'meuapp-public-update-'));
const env = { ...process.env, APPDATA: temp }; delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(previousApp, ['--inspect=127.0.0.1:15296', `--user-data-dir=${temp}`], { env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
let ws, logs = '';
child.stderr.on('data', data => { logs += data.toString(); });
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const electron = "process.getBuiltinModule('module').createRequire(process.execPath)('electron')";
try {
  let endpoint;
  for (let attempt = 0; attempt < 100; attempt++) {
    try { endpoint = (await fetch('http://127.0.0.1:15296/json/list').then(response => response.json()))[0]?.webSocketDebuggerUrl; if (endpoint) break; } catch {}
    if (child.exitCode !== null) throw Error('Previous packaged app failed to start: ' + logs);
    await delay(100);
  }
  assert.ok(endpoint, 'Previous packaged application inspector unavailable');
  ws = new WebSocket(endpoint);
  await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }); });
  let id = 0; const pending = new Map();
  ws.addEventListener('message', event => { const message = JSON.parse(event.data); pending.get(message.id)?.(message); });
  async function main(expression) {
    const next = ++id;
    const message = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => { pending.delete(next); reject(Error('Published updater inspector timeout')); }, 12000);
      pending.set(next, value => { clearTimeout(timer); pending.delete(next); resolve(value); });
      ws.send(JSON.stringify({ id: next, method: 'Runtime.evaluate', params: { expression, awaitPromise: true, returnByValue: true } }));
    });
    if (message.error || message.result?.exceptionDetails) throw Error(JSON.stringify(message.error || message.result.exceptionDetails));
    return message.result.result.value;
  }
  // Use the actual previous app's singleton updater and real GitHub provider.
  // Isolate downloads before the first scheduled check, and disable installation.
  const setup = await main(`(()=>{const {app}=${electron};const require=process.getBuiltinModule('module').createRequire(process.resourcesPath+'/app.asar/desktop/main.js');globalThis.publishedProbeUpdater=require('electron-updater').autoUpdater;publishedProbeUpdater.autoInstallOnAppQuit=false;Object.defineProperty(publishedProbeUpdater.app,'baseCachePath',{value:${JSON.stringify(temp)},configurable:true});globalThis.publishedProbeDownloads=0;globalThis.publishedProbeResult=null;publishedProbeUpdater.on('update-downloaded',info=>{publishedProbeDownloads++;publishedProbeResult={version:info.version,file:info.downloadedFile};});return {version:app.getVersion(),packaged:app.isPackaged,autoDownload:publishedProbeUpdater.autoDownload,installationDisabled:!publishedProbeUpdater.autoInstallOnAppQuit};})()`);
  assert.equal(setup.packaged, true);
  assert.equal(setup.autoDownload, true, 'The distributed previous application must download updates automatically');
  assert.notEqual(setup.version, targetVersion);
  console.log(JSON.stringify({ previousVersion: setup.version, targetVersion, automaticDownload: true, installationDisabled: true }));
  const view = code => main(`(()=>{const {BrowserWindow}=${electron};return BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('app.asar'))?.webContents.executeJavaScript(${JSON.stringify(code)},true);})()`);
  for (let attempt = 0; attempt < 100; attempt++) {
    if (await view('typeof window.electronAPI?.getUpdateState === "function"')) break;
    await delay(100);
  }
  await view('electronAPI.checkForUpdates()');
  let state, lastStatus = '', retried = 0;
  const deadline = Date.now() + 240000;
  while (Date.now() < deadline) {
    state = await view('electronAPI.getUpdateState()');
    const status = state.status + ':' + Math.floor((state.percent || 0) / 25) * 25;
    if (status !== lastStatus) { console.log(JSON.stringify({ status: state.status, version: state.version, percent: state.percent })); lastStatus = status; }
    if (state.status === 'ready') break;
    if (['error', 'no-release'].includes(state.status)) {
      if (++retried > 2) throw Error('Public updater failed: ' + JSON.stringify(state));
      await delay(5000); await view('electronAPI.checkForUpdates()');
    }
    await delay(500);
  }
  assert.equal(state.status, 'ready', 'Previous app must finish downloading the public update');
  assert.equal(state.version, targetVersion);
  const downloaded = await main('({result:publishedProbeResult,downloads:publishedProbeDownloads,installationDisabled:!publishedProbeUpdater.autoInstallOnAppQuit})');
  assert.equal(downloaded.installationDisabled, true);
  assert.equal(downloaded.result.version, targetVersion);
  assert.equal(downloaded.downloads, 1);
  const installer = await fs.readFile(path.join(output,`MeuApp-Setup-${targetVersion}.exe`));
  const publicBytes = await fs.readFile(downloaded.result.file);
  const sha512 = bytes => crypto.createHash('sha512').update(bytes).digest('base64');
  assert.equal(sha512(publicBytes), sha512(installer), 'The actual previous updater must download the exact tested installer');
  await main(`(()=>{const {BrowserWindow}=${electron};BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('app.asar')).showInactive();return true;})()`);
  let notice = false;
  for (let attempt = 0; attempt < 50; attempt++) {
    notice = await view(`document.body.textContent.includes(${JSON.stringify('Atualização ' + targetVersion + ' pronta')}) && document.body.textContent.includes('Reiniciar e atualizar')`);
    if (notice) break;
    await delay(100);
  }
  assert.equal(notice, true, 'The previous application must display its restart/update action: ' + await view('document.body.innerText'));
  const report = { passed: true, checkedAt: new Date().toISOString(), fromVersion: setup.version, toVersion: targetVersion, previousPackagedApp: previousApp, actualGithubUpdateProvider: true, automaticDownload: true, downloads: downloaded.downloads, downloadedInstallerMatchesTestedSha512: true, sha512: sha512(publicBytes), restartUpdateNoticeShown: true, profileAndCacheIsolated: true, installation: 'Not executed: autoInstallOnAppQuit was disabled in the isolated test; the user can choose Restart and update in their own app.' };
  await fs.writeFile(`docs/validation/published-updater-${targetVersion}.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  await main(`${electron}.app.exit(0)`);
} finally {
  ws?.close(); child.kill();
}
