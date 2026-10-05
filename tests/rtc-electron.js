import { app, BrowserWindow } from 'electron';
import { createRequire } from 'node:module';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { createRealtimeSignaling } from '../server/src/realtime.js';
const { Server } = createRequire(new URL('../server/package.json', import.meta.url))('socket.io');
const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
const windows = [];
let io, server, realtime;
let resultCode = 0;
async function waitFor(window, predicate, description) {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    const result = await window.webContents.executeJavaScript('window.result?.()');
    if (result && predicate(result)) return result;
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  throw new Error(`Timeout: ${description}: ${JSON.stringify(await window.webContents.executeJavaScript('window.result?.()'))}`);
}
app.whenReady().then(async () => {
try {
  server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      const relative = url.pathname === '/' ? 'tests/rtc-harness.html' : url.pathname.slice(1);
      const file = path.resolve(root, relative);
      if (!file.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
      const data = await fs.readFile(file);
      res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : 'text/html'); res.end(data);
    } catch { res.writeHead(404); res.end(); }
  });
  io = new Server(server);
  const rooms = {}; const users = {};
  realtime = createRealtimeSignaling(io, rooms, users);
  io.on('connection', socket => { users[socket.id] = { id: socket.id, username: 'Synthetic test' }; realtime.attach(socket); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  for (const role of ['host', 'guest']) {
    const window = new BrowserWindow({ show: false, webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false, backgroundThrottling: false } });
    windows.push(window); await window.loadURL(`${url}/?role=${role}`);
    await window.webContents.executeJavaScript('window.start()');
  }
  const [host, guest] = windows;
  const received = result => Object.values(result.stats).some(p => p.inbound.some(s => s.kind === 'audio' && s.bytes > 0) && p.inbound.some(s => s.kind === 'video' && s.frames > 0));
  const hostMedia = await waitFor(host, received, 'host receives encoded audio and video');
  const guestMedia = await waitFor(guest, received, 'guest receives encoded audio and video');
  assert.equal(hostMedia.errors.length, 0); assert.equal(guestMedia.errors.length, 0);
  await host.webContents.executeJavaScript('window.prepareShare()');
  const request = await guest.webContents.executeJavaScript('window.watch()'); assert.equal(request.ok, true);
  await waitFor(host, result => result.pending, 'host receives consent request');
  await host.webContents.executeJavaScript('window.accept()');
  await waitFor(guest, result => result.readyState === 'open', 'real DataChannel OPEN');
  assert.ok((await guest.webContents.executeJavaScript('window.sendInput()')).every(Boolean));
  const controlled = await waitFor(host, result => result.receiver?.totalAccepted === 5, 'five commands arrive through DataChannel');
  assert.deepEqual(controlled.pointer, { x: 320, y: 180 }); assert.equal(controlled.pointerDown, false); assert.equal(controlled.activeKey, null);
  await host.webContents.executeJavaScript('window.stopAssistance()');
  await waitFor(guest, result => result.revoked && result.transport === 'disconnected', 'remote revocation');
  const continued = await waitFor(host, result => received(result) && Object.values(result.states).every(s => s?.state === 'connected'), 'voice survives revocation');
  assert.equal(continued.receiver.totalAccepted, 5);
  await host.webContents.executeJavaScript('window.stopShare()');
  console.log(JSON.stringify({ passed: true, encodedAudioVideo: 'bidirectional', dataChannel: 'OPEN', inputPackets: 5, revoked: true, voiceContinues: true, route: Object.values(continued.stats)[0]?.route?.route, note: 'Synthetic media and canvas target; physical OS input and external NAT/TURN are separate acceptance tests.' }));
} catch (error) { console.error(error.stack); resultCode = 1; }
finally {
  for (const window of windows) { try { await window.webContents.executeJavaScript('window.cleanup?.()'); } catch {} window.destroy(); }
  realtime?.close();
  if (io) await new Promise(resolve => io.close(resolve));
  app.exit(resultCode);
}
});
