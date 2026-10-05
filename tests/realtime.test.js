import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createRequire } from 'node:module';
import { createRealtimeSignaling } from '../server/src/realtime.js';
import { SessionGuard } from '../desktop/SessionGuard.js';
import { redact } from '../desktop/logging.js';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const { Server } = createRequire(new URL('../server/package.json', import.meta.url))('socket.io');
const { io: client } = createRequire(new URL('../client/package.json', import.meta.url))('socket.io-client');
const event = (socket, name) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => { socket.off(name, handler); reject(new Error(`Timeout: ${name}`)); }, 2000);
  const handler = data => { clearTimeout(timer); resolve(data); };
  socket.once(name, handler);
});
const absent = (socket, name, action) => new Promise((resolve, reject) => {
  const handler = () => { clearTimeout(timer); reject(new Error(`Unexpected: ${name}`)); };
  const timer = setTimeout(() => { socket.off(name, handler); resolve(); }, 80);
  socket.once(name, handler); action();
});

test('Real Socket.IO: consent, room isolation, replay, revoke and disconnect', async t => {
  const server = http.createServer();
  const io = new Server(server);
  const users = {}; const rooms = {};
  const realtime = createRealtimeSignaling(io, rooms, users);
  io.on('connection', socket => { users[socket.id] = { id: socket.id, username: 'Test user' }; realtime.attach(socket); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const clients = [];
  t.after(async () => { clients.forEach(c => c.close()); realtime.close(); await new Promise(resolve => io.close(resolve)); });
  const connect = async () => { const c = client(`http://127.0.0.1:${server.address().port}`, { transports: ['websocket'], reconnection: false }); clients.push(c); await event(c, 'connect'); return c; };
  const host = await connect(); const guest = await connect(); const outsider = await connect();
  const emit = (c, name, data) => c.timeout(1000).emitWithAck(name, data);
  await emit(host, 'join_voice_channel', { channelId: 'voice-one' });
  await emit(guest, 'join_voice_channel', { channelId: 'voice-one' });
  await emit(outsider, 'join_voice_channel', { channelId: 'voice-two' });
  assert.ok((await emit(guest, 'interaction_request', { targetSocketId: host.id, sessionId: 'session-before-share' })).error);
  const share = event(guest, 'screen_share_started');
  host.emit('voice_state_toggle', { channelId: 'voice-one', isScreenSharing: true, canAssist: true });
  await share;
  assert.ok((await emit(guest, 'interaction_request', { targetSocketId: host.id, sessionId: 'session-before-view' })).error);
  const view = event(host, 'screen_request_view');
  guest.emit('screen_request_view', { targetSocketId: host.id, channelId: 'voice-one' }); await view;
  const request = event(host, 'interaction_request');
  assert.equal((await emit(guest, 'interaction_request', { targetSocketId: host.id, sessionId: 'session-first' })).ok, true);
  assert.equal((await request).fromUser.id, guest.id);
  assert.ok((await emit(outsider, 'interaction_consent', { targetSocketId: guest.id, sessionId: 'session-first', approved: true })).error);
  await absent(host, 'interaction_signal_offer', () => guest.emit('interaction_signal_offer', { targetSocketId: host.id, sessionId: 'session-first', sdp: { type: 'offer' } }));
  const consent = await emit(host, 'interaction_consent', { targetSocketId: guest.id, sessionId: 'session-first', approved: true, token: 'forged' });
  assert.ok(consent.token.length >= 40); assert.notEqual(consent.token, 'forged');
  const approval = event(guest, 'interaction_consent');
  host.emit('interaction_ready', { sessionId: 'session-first', targetSocketId: guest.id });
  assert.equal((await approval).token, consent.token);
  const packet = { sessionId: 'session-first', token: consent.token, participantId: guest.id, sequence: 0, eventType: 'KeyPressed', payload: { key: 'Enter' } };
  await absent(host, 'interaction_event', () => outsider.emit('interaction_event', { targetSocketId: host.id, sessionId: packet.sessionId, event: packet }));
  await absent(host, 'interaction_event', () => guest.emit('interaction_event', { targetSocketId: host.id, sessionId: packet.sessionId, event: { ...packet, token: 'wrong' } }));
  const delivered = event(host, 'interaction_event');
  guest.emit('interaction_event', { targetSocketId: host.id, sessionId: packet.sessionId, event: packet });
  assert.equal((await delivered).event.sequence, 0);
  const nativeAck={kind:'native_ack',sessionId:packet.sessionId,token:consent.token,sequence:0,eventType:'KeyPressed',success:true,nativeAck:'OK'};
  await absent(guest,'interaction_ack',()=>outsider.emit('interaction_ack',{targetSocketId:guest.id,sessionId:packet.sessionId,ack:nativeAck}));
  await absent(guest,'interaction_ack',()=>host.emit('interaction_ack',{targetSocketId:guest.id,sessionId:packet.sessionId,ack:{...nativeAck,token:'wrong'}}));
  const acknowledgement=event(guest,'interaction_ack');host.emit('interaction_ack',{targetSocketId:guest.id,sessionId:packet.sessionId,ack:nativeAck});assert.equal((await acknowledgement).ack.sequence,0);
  const revocation = event(guest, 'interaction_revoke'); host.emit('interaction_revoke', { sessionId: packet.sessionId }); await revocation;
  assert.equal(realtime.sessions.size, 0);
  await absent(guest,'interaction_ack',()=>host.emit('interaction_ack',{targetSocketId:guest.id,sessionId:packet.sessionId,ack:nativeAck}));
  await absent(host, 'interaction_event', () => guest.emit('interaction_event', { targetSocketId: host.id, sessionId: packet.sessionId, event: packet }));
  const nextRequest = event(host, 'interaction_request');
  await emit(guest, 'interaction_request', { targetSocketId: host.id, sessionId: 'session-second' }); await nextRequest;
  const next = await emit(host, 'interaction_consent', { targetSocketId: guest.id, sessionId: 'session-second', approved: true });
  assert.notEqual(next.token, consent.token);
  const disconnected = event(host, 'interaction_revoke'); guest.disconnect(); await disconnected;
  assert.equal(realtime.sessions.size, 0);
  await absent(host, 'voice_offer', () => outsider.emit('voice_offer', { targetSocketId: host.id, channelId: 'voice-two', sdp: {} }));
});

test('Native guard expires, rejects other frames/displays and never restores grants', () => {
  let now = 1000; const revoked = [];
  const guard = new SessionGuard({ now: () => now, onRevoke: s => revoked.push(s) });
  guard.authorize({ sessionId: 'one', guestId: 'guest', displayId: 2, ownerId: 4 });
  assert.equal(guard.accepts('one', 4, 2), true);
  assert.equal(guard.accepts('one', 5, 2), false);
  assert.equal(guard.accepts('one', 4, 1), false);
  now += 6000; assert.equal(guard.heartbeat('one', 4), true);
  now += 6501; assert.equal(guard.accepts('one', 4, 2), false);
  assert.equal(guard.heartbeat('one', 4), false);
  assert.equal(revoked.length, 1);
  guard.authorize({ sessionId: 'two', guestId: 'guest', displayId: 2, ownerId: 4 });
  assert.equal(guard.accepts('one', 4, 2), false);
  guard.revoke(); assert.equal(guard.accepts('two', 4, 2), false);
});

test('Logs redact nested ICE credentials, consent tokens and input payloads', () => {
  const result = JSON.stringify(redact({ rtc: { iceServers: [{ credential: 'TURN_PRIVATE', username: 'temporary' }] }, nested: { token: 'CONSENT_PRIVATE' }, payload: { key: 'PRIVATE_INPUT' } }));
  assert.equal(result.includes('TURN_PRIVATE'), false);
  assert.equal(result.includes('CONSENT_PRIVATE'), false);
  assert.equal(result.includes('PRIVATE_INPUT'), false);
});

test('native input requires activation, correct guest/token and increasing sequence', () => {
  const guard=new SessionGuard();const token='a'.repeat(43);
  guard.authorize({sessionId:'native-grant',guestId:'guest',displayId:2,ownerId:4});
  const auth={token,guestId:'guest',sequence:0};
  assert.equal(guard.acceptsInput('native-grant',4,2,auth),false);
  assert.equal(guard.activate('native-grant',4,'wrong',token),false);
  assert.equal(guard.activate('native-grant',4,'guest',token),true);
  assert.equal(guard.acceptsInput('native-grant',4,2,{...auth,token:'wrong'}),false);
  assert.equal(guard.acceptsInput('native-grant',4,2,{...auth,guestId:'wrong'}),false);
  assert.equal(guard.acceptsInput('native-grant',4,1,auth),false);
  assert.equal(guard.acceptsInput('native-grant',4,2,auth),true);
  assert.equal(guard.acceptsInput('native-grant',4,2,auth),false);
  guard.revoke();assert.equal(guard.acceptsInput('native-grant',4,2,{...auth,sequence:1}),false);
});

test('Compiled Windows helper starts, responds to PING and exits without injecting input', { skip: process.platform !== 'win32', timeout: 5000 }, async () => {
  const proc = spawn(fileURLToPath(new URL('../desktop/NativeInputHost.exe', import.meta.url)), [], { windowsHide: true });
  let output = '';
  proc.stdout.on('data', data => { output += data; });
  proc.stdin.end('PING\nEXIT\n');
  const code = await new Promise((resolve, reject) => { proc.once('exit', resolve); proc.once('error', reject); });
  assert.equal(code, 0); assert.match(output, /READY/); assert.match(output, /PONG/);
});
