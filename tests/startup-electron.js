import { app, BrowserWindow } from 'electron';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import { spawn } from 'node:child_process';
const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'meuapp-startup-'));
app.setPath('userData', temp);
const base = 'http://127.0.0.1:15631', origin = 'http://127.0.0.1:15630';
let mode = 'offline', meUnavailable = false, credentialRequests = 0;
const gateway = http.createServer((req, res) => {
  if (req.url.startsWith('/api/auth/')) credentialRequests++;
  if (req.url === '/api/health' && mode !== 'ready') {
    res.writeHead(mode === 'offline' ? 503 : 200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ status: 'ok' }));
  }
  if (req.url === '/api/auth/me' && meUnavailable) { res.writeHead(503); return res.end(); }
  const upstream = http.request(base + req.url, { method: req.method, headers: req.headers }, reply => {
    res.writeHead(reply.statusCode, reply.headers); reply.pipe(res);
  });
  upstream.on('error', () => { res.writeHead(503); res.end(); });
  req.pipe(upstream);
});
const backend = spawn(process.execPath, ['server/src/server.js'], {
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', DATABASE_URL: '', SQLITE_PATH: path.join(temp, 'test.db'), PORT: '15631', HOST: '127.0.0.1', FRONTEND_DIR: path.resolve('client/dist') },
  windowsHide: true, stdio: ['ignore', 'pipe', 'pipe']
});
let logs = '', window, exitCode = 0;
backend.stderr.on('data', data => logs += data);
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function wait(code, name) {
  const deadline = Date.now() + 25000;
  while (Date.now() < deadline) { if (await window.webContents.executeJavaScript(code)) return; await pause(100); }
  throw Error(`${name}: ${await window.webContents.executeJavaScript('document.body.innerText')}`);
}
app.whenReady().then(async () => {
try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(base + '/api/health')).ok) break; } catch {} if (backend.exitCode !== null || i === 99) throw Error(logs); await pause(100); }
  await new Promise(resolve => gateway.listen(15630, '127.0.0.1', resolve));
  const response = await fetch(base + '/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ handle: 'startup', password: 'Startup-password-123' }) });
  assert.equal(response.status, 201); const account = await response.json();
  const index = await fetch(origin + '/'); assert.equal(index.status, 200); assert.equal(index.headers.get('cache-control'), 'no-store');
  const html = await index.text(); assert.ok(html.includes('assets/'));
  const asset = html.match(/src="([^"]+\.js)"/)[1];
  assert.ok((await fetch(new URL(asset, origin))).headers.get('cache-control').includes('immutable'));
  window = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
  await window.loadURL(origin);
  await window.webContents.executeJavaScript(`sessionStorage.setItem(${JSON.stringify('auth_session:' + origin)}, ${JSON.stringify(account.token)});localStorage.setItem('backend_url','http://127.0.0.1:5000');true`);
  window.reload();
  await wait("document.querySelector('[data-testid=connection-status]')?.textContent.includes('reconectar automaticamente')", 'offline status');
  assert.equal(credentialRequests, 0, 'offline probe never sends credentials');
  mode = 'ready';
  await wait("document.body.textContent.includes('Canais de Voz')", 'automatic recovery without a terminal or URL selection');
  meUnavailable = true; window.reload();
  await wait("document.querySelector('[data-testid=connection-status]')?.textContent.includes('reconectar automaticamente')", 'restoring-session outage');
  assert.equal(await window.webContents.executeJavaScript(`sessionStorage.getItem(${JSON.stringify('auth_session:' + origin)})`), account.token, 'transient failure preserves saved session');
  meUnavailable = false;
  await wait("document.body.textContent.includes('Canais de Voz')", 'login recovers automatically');
  await fetch(base + '/api/auth/session', { method: 'DELETE', headers: { Authorization: 'Bearer ' + account.token } });
  window.reload();
  await wait("document.querySelector('[data-testid=auth-submit]')?.disabled===false", 'expired token returns to login');
  assert.equal(await window.webContents.executeJavaScript(`sessionStorage.getItem(${JSON.stringify('auth_session:' + origin)})`), null);
  mode = 'legacy'; window.reload();
  await wait("document.querySelector('[data-testid=connection-status]')?.textContent.includes('precisa ser atualizado')", 'legacy backend is identified');
  const before = credentialRequests;
  await window.webContents.executeJavaScript("document.querySelector('[data-testid=auth-submit]').click();true");
  assert.equal(credentialRequests, before);
  const report = { passed: true, version: JSON.parse(await fs.readFile('package.json','utf8')).version, productionWebServedByBackend: true, noViteRequired: true, sameOriginAutomaticConnection: true, outageRecovery: true, savedSessionPreservedOnOutage: true, revokedSessionRemoved: true, legacyBackendBlocksCredentials: true, scope: 'Local production web bundle and real isolated backend; no hosted service changed.' };
  await fs.mkdir('docs/validation', { recursive: true }); await fs.writeFile('docs/validation/startup.json', JSON.stringify(report, null, 2)); console.log(JSON.stringify(report));
} catch (error) { console.error(error.stack); exitCode = 1; }
finally { window?.destroy(); backend.kill(); gateway.closeAllConnections(); gateway.close(); app.exit(exitCode); }
});
