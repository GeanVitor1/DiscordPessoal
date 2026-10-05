import test from 'node:test';
import assert from 'node:assert/strict';
import { RealtimeTransport, InteractionSession, InteractionValidator, InteractionEventReceiver, CoordinateMapper } from '../src/interaction/index.js';
import { addRemoteCandidate, setRemoteDescription, selectedRoute } from '../src/rtc/ice.js';

test('ICE before remote SDP is queued and only selected pair determines TURN', async () => {
  const received = [];
  const pc = { signalingState: 'stable', remoteDescription: null, addIceCandidate: async c => received.push(c), setRemoteDescription: async d => { pc.remoteDescription = d; } };
  await addRemoteCandidate(pc, { candidate: 'early' }); assert.equal(received.length, 0);
  await setRemoteDescription(pc, { type: 'offer' }); assert.equal(received.length, 1);
  pc.getStats = async () => new Map([['t', { type: 'transport', selectedCandidatePairId: 'direct' }], ['direct', { localCandidateId: 'l', remoteCandidateId: 'r', currentRoundTripTime: 0.025 }], ['relay', { type: 'candidate-pair', state: 'succeeded', localCandidateId: 'unused' }], ['l', { candidateType: 'host' }], ['r', { candidateType: 'srflx' }], ['unused', { candidateType: 'relay' }]]);
  assert.equal((await selectedRoute(pc)).route, 'STUN');
});

test('Fallback emits once, scopes sessions and cleans every socket listener', () => {
  const listeners = new Map(); const emitted = [];
  const socket = { connected: true, on: (e, fn) => listeners.set(e, fn), off: (e, fn) => { if (listeners.get(e) === fn) listeners.delete(e); }, emit: (e, data) => emitted.push({ e, data }) };
  const transport = new RealtimeTransport({ socket, sessionId: 'session-one', targetPeerSocketId: 'peer' });
  transport.connect(); assert.equal(transport.status, 'fallback');
  assert.equal(transport.send({ sessionId: 'session-one' }), true); assert.equal(emitted.length, 1);
  assert.equal(transport.send({ sessionId: 'other' }), false);
  listeners.get('disconnect')(); assert.equal(transport.send({ sessionId: 'session-one' }), false);
  assert.equal(listeners.size, 0); assert.equal(transport._isDestroyed, true);
});

test('Missing sequence cannot freeze release events; revoke blocks buffered input', async () => {
  const session = new InteractionSession({ sessionId: 's', hostId: 'h', guestId: 'g', token: 'secret' }); session.grantConsent();
  const executed = [];
  const receiver = new InteractionEventReceiver({ session, validator: new InteractionValidator(), coordinateMapper: new CoordinateMapper(), target: { keyPressed: key => executed.push(key), keyReleased: key => executed.push(`up:${key}`) } });
  const packet = { sessionId: 's', participantId: 'g', token: 'secret', eventType: 'KeyPressed', payload: { key: 'Control' } };
  receiver.receive({ ...packet, sequence: 0 });
  receiver.receive({ ...packet, sequence: 2, eventType: 'KeyReleased' });
  await new Promise(resolve => setTimeout(resolve, 120));
  assert.deepEqual(executed, ['Control', 'up:Control']);
  receiver.receive({ ...packet, sequence: 4 }); session.revoke();
  await new Promise(resolve => setTimeout(resolve, 120));
  assert.equal(executed.length, 2); assert.equal(session.token, null);
  receiver.resetSequence(); session.destroy();
});

test('Rejects non-finite click coordinates, invalid buttons and command newlines', () => {
  const session = new InteractionSession({ sessionId: 's', hostId: 'h', guestId: 'g', token: 'secret' }); session.grantConsent();
  const validator = new InteractionValidator();
  const base = { sessionId: 's', participantId: 'g', token: 'secret', eventType: 'PointerDown' };
  for (const payload of [{ button: 0, x: NaN }, { button: 3 }, { button: 0.5 }, { button: 0, y: Infinity }]) assert.equal(validator.validate({ ...base, payload }, session).valid, false);
  assert.equal(validator.validate({ ...base, eventType: 'KeyPressed', payload: { key: 'A\nKEYDOWN B' } }, session).valid, false);
  session.destroy();
});

test('A silently lost peer expires without reusing its authorization', () => {
  let now = 1000;
  const listeners = new Map();
  const socket = { connected: true, on: (event, handler) => listeners.set(event, handler), off: event => listeners.delete(event), emit: () => {} };
  const transport = new RealtimeTransport({ socket, sessionId: 'session', sessionToken: 'secret', targetPeerSocketId: 'peer', now: () => now });
  transport.connect();
  listeners.get('interaction_heartbeat')({ fromSocketId: 'peer', sessionId: 'session', token: 'bad' });
  assert.equal(transport.isPeerAlive(), false);
  listeners.get('interaction_heartbeat')({ fromSocketId: 'peer', sessionId: 'session', token: 'secret' });
  assert.equal(transport.isPeerAlive(), true);
  now += 6501; transport._checkPeerLiveness();
  assert.equal(transport._isDestroyed, true); assert.equal(transport.status, 'disconnected');
  transport.connect(); assert.equal(transport._isDestroyed, true);
});
