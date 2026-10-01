import assert from 'node:assert/strict';
import test from 'node:test';

import {
  SessionState,
  InteractionEventType,
  createInteractionEvent,
  InteractionSerializer,
  InteractionSession,
  InteractionValidator,
  CoordinateMapper,
  CanvasInteractionTarget,
  NativeDesktopInteractionTarget,
  InteractionEventReceiver
} from '../src/interaction/index.js';


test('InteractionSerializer - JSON and Binary serialization round-trip', () => {
  const packet = createInteractionEvent({
    sessionId: 'sess-123',
    participantId: 'guest-1',
    token: 'token-abc',
    sequence: 1,
    eventType: InteractionEventType.PointerMove,
    payload: { x: 0.42, y: 0.71 }
  });

  // JSON round-trip
  const jsonStr = InteractionSerializer.serialize(packet, 'json');
  assert.equal(typeof jsonStr, 'string');
  const deserializedJson = InteractionSerializer.deserialize(jsonStr);
  assert.deepEqual(deserializedJson, packet);

  // Binary (Uint8Array) round-trip
  const binary = InteractionSerializer.serialize(packet, 'binary');
  assert.ok(binary instanceof Uint8Array);
  const deserializedBinary = InteractionSerializer.deserialize(binary);
  assert.deepEqual(deserializedBinary, packet);
});

test('InteractionSession - State machine transitions and authorization', () => {
  const auditLogs = [];
  const session = new InteractionSession({
    sessionId: 'sess-test',
    hostId: 'host-1',
    guestId: 'guest-2',
    token: 'secret-xyz',
    timeoutMs: 5000,
    onAudit: (entry) => auditLogs.push(entry)
  });

  assert.equal(session.getState(), SessionState.Created);
  assert.equal(session.isAuthorized(), false);

  // Created -> WaitingForConsent
  session.requestConsent();
  assert.equal(session.getState(), SessionState.WaitingForConsent);
  assert.equal(session.isAuthorized(), false);

  // WaitingForConsent -> Authorized
  session.grantConsent();
  assert.equal(session.getState(), SessionState.Authorized);
  assert.equal(session.isAuthorized(), true);

  // Authorized -> Active
  session.activate();
  assert.equal(session.getState(), SessionState.Active);
  assert.equal(session.isAuthorized(), true);

  // Revoke immediately
  session.revoke('Security alert');
  assert.equal(session.getState(), SessionState.Revoked);
  assert.equal(session.isAuthorized(), false);

  // Audit logs recorded transitions
  assert.ok(auditLogs.some(log => log.action === 'SESSION_CREATED'));
  assert.ok(auditLogs.some(log => log.action === 'STATE_CHANGE' && log.details.to === SessionState.Authorized));
  assert.ok(auditLogs.some(log => log.action === 'STATE_CHANGE' && log.details.to === SessionState.Revoked));

  session.destroy();
});

test('InteractionSession - Inactivity Timeout', async () => {
  let timedOut = false;
  const session = new InteractionSession({
    sessionId: 'sess-timeout',
    hostId: 'host-1',
    guestId: 'guest-2',
    token: 'secret-xyz',
    timeoutMs: 50,
    onStateChange: (newState) => {
      if (newState === SessionState.Finished) timedOut = true;
    }
  });

  session.grantConsent();
  assert.equal(session.getState(), SessionState.Authorized);

  await new Promise(r => setTimeout(r, 80));
  assert.equal(session.getState(), SessionState.Finished);
  assert.equal(timedOut, true);

  session.destroy();
});

test('InteractionValidator - Strict 6-step validation pipeline', () => {
  const validator = new InteractionValidator();
  const session = new InteractionSession({
    sessionId: 'sess-valid',
    hostId: 'host-1',
    guestId: 'guest-2',
    token: 'valid-token'
  });

  const validEvent = {
    sessionId: 'sess-valid',
    participantId: 'guest-2',
    token: 'valid-token',
    sequence: 1,
    eventType: InteractionEventType.PointerMove,
    payload: { x: 0.5, y: 0.5 }
  };

  // Step 1: Session existence/mismatch
  const errSession = validator.validate({ ...validEvent, sessionId: 'wrong-sess' }, session);
  assert.equal(errSession.valid, false);
  assert.equal(errSession.code, 'SESSION_MISMATCH');

  // Step 2: Participant validation
  const errParticipant = validator.validate({ ...validEvent, participantId: 'host-1' }, session);
  assert.equal(errParticipant.valid, false);
  assert.equal(errParticipant.code, 'UNAUTHORIZED_PARTICIPANT');

  // Step 3 & 5: State authorization (currently Created)
  const errState = validator.validate(validEvent, session);
  assert.equal(errState.valid, false);
  assert.equal(errState.code, 'NOT_AUTHORIZED');

  session.grantConsent(); // Now Authorized

  // Step 4: Token validation
  const errToken = validator.validate({ ...validEvent, token: 'bad-token' }, session);
  assert.equal(errToken.valid, false);
  assert.equal(errToken.code, 'INVALID_TOKEN');

  // Step 6: Valid payload bounds (x, y between 0 and 1)
  const errBounds = validator.validate({
    ...validEvent,
    payload: { x: 1.5, y: 0.2 }
  }, session);
  assert.equal(errBounds.valid, false);
  assert.equal(errBounds.code, 'COORDINATES_OUT_OF_BOUNDS');

  // Full Valid Event passes
  const okResult = validator.validate(validEvent, session);
  assert.equal(okResult.valid, true);

  session.destroy();
});

test('InteractionValidator - Rate Limiting', () => {
  const validator = new InteractionValidator({ maxEventsPerSecond: 5, burstCapacity: 5 });
  const session = new InteractionSession({
    sessionId: 'sess-rate',
    hostId: 'host-1',
    guestId: 'guest-rate',
    token: 'rate-tok'
  });
  session.grantConsent();

  const event = {
    sessionId: 'sess-rate',
    participantId: 'guest-rate',
    token: 'rate-tok',
    eventType: InteractionEventType.PointerMove,
    payload: { x: 0.1, y: 0.2 }
  };

  // 5 events within burst capacity succeed
  for (let i = 0; i < 5; i++) {
    assert.equal(validator.validate(event, session).valid, true);
  }

  // 6th event immediately exceeds burst limit
  const rateLimitResult = validator.validate(event, session);
  assert.equal(rateLimitResult.valid, false);
  assert.equal(rateLimitResult.code, 'RATE_LIMIT_EXCEEDED');

  session.destroy();
});

test('CoordinateMapper - Aspect ratio contain and multiple interaction zones', () => {
  // Container: 1920x1080 (16:9). Content Aspect Ratio: 16:9 -> Direct fit
  const mapper1 = new CoordinateMapper({ width: 1920, height: 1080 }, { width: 16, height: 9 });
  const mapped1 = mapper1.mapNormalizedToPixels(0.5, 0.5);
  assert.equal(mapped1.pixelX, 960);
  assert.equal(mapped1.pixelY, 540);

  // Letterbox test: Container is square 1000x1000, Content is 16:9 (1600x900)
  // Height rendered should be 1000 / (16/9) = 562.5, offsetY = (1000 - 562.5)/2 = 218.75
  const mapper2 = new CoordinateMapper({ width: 1000, height: 1000 }, { width: 16, height: 9 });
  const mapped2 = mapper2.mapNormalizedToPixels(0.5, 0);
  assert.equal(mapped2.pixelX, 500);
  assert.ok(Math.abs(mapped2.pixelY - 218.75) < 0.1);

  // Reverse mapping pixels to normalized
  const rev = mapper2.mapPixelsToNormalized(500, 218.75);
  assert.ok(Math.abs(rev.normX - 0.5) < 0.01);
  assert.ok(Math.abs(rev.normY - 0.0) < 0.01);

  // Multiple interactive sub-areas
  mapper1.registerArea('toolbar', { x: 0, y: 0, width: 1, height: 0.1, target: 'tools' });
  const zoneHit = mapper1.findArea(0.5, 0.05);
  assert.ok(zoneHit);
  assert.equal(zoneHit.areaId, 'toolbar');
  assert.equal(zoneHit.localNormX, 0.5);
  assert.equal(zoneHit.localNormY, 0.5);

  const zoneMiss = mapper1.findArea(0.5, 0.5);
  assert.equal(zoneMiss, null);
});

test('InteractionEventReceiver - Sequence ordering, deduplication and execution', () => {
  const session = new InteractionSession({
    sessionId: 'sess-exec',
    hostId: 'host-1',
    guestId: 'guest-1',
    token: 'tok-123'
  });
  session.grantConsent();

  const validator = new InteractionValidator({ maxEventsPerSecond: 100, burstCapacity: 100 });
  const mapper = new CoordinateMapper({ width: 800, height: 600 });

  const executedEvents = [];
  const mockTarget = {
    pointerMove: (x, y) => executedEvents.push({ type: 'PointerMove', x, y }),
    pointerDown: (btn, x, y) => executedEvents.push({ type: 'PointerDown', btn, x, y }),
    pointerUp: (btn, x, y) => executedEvents.push({ type: 'PointerUp', btn, x, y }),
    scroll: (d) => executedEvents.push({ type: 'Scroll', d }),
    keyPressed: (k) => executedEvents.push({ type: 'KeyPressed', k }),
    keyReleased: (k) => executedEvents.push({ type: 'KeyReleased', k })
  };

  const receiver = new InteractionEventReceiver({
    session,
    validator,
    coordinateMapper: mapper,
    target: mockTarget
  });

  const baseEvent = {
    sessionId: 'sess-exec',
    participantId: 'guest-1',
    token: 'tok-123',
    eventType: InteractionEventType.PointerMove,
    payload: { x: 0.25, y: 0.5 }
  };

  // 1. In-order execution: sequence 0
  const r0 = receiver.receive({ ...baseEvent, sequence: 0 });
  assert.equal(r0.accepted, true);
  assert.equal(executedEvents.length, 1);
  assert.deepEqual(executedEvents[0], { type: 'PointerMove', x: 200, y: 300 });

  // 2. Duplicate rejection: sequence 0 again
  const r0dup = receiver.receive({ ...baseEvent, sequence: 0 });
  assert.equal(r0dup.accepted, false);
  assert.equal(r0dup.code, 'DUPLICATE_SEQUENCE');
  assert.equal(executedEvents.length, 1);

  // 3. Out of order: sequence 2 arrives before sequence 1 -> should buffer sequence 2
  const r2 = receiver.receive({ ...baseEvent, sequence: 2, payload: { x: 0.5, y: 0.5 } });
  assert.equal(r2.accepted, true);
  assert.equal(r2.buffered, true);
  assert.equal(executedEvents.length, 1); // still only sequence 0 executed

  // 4. Missing sequence 1 arrives -> should execute sequence 1 and immediately flush sequence 2
  const r1 = receiver.receive({
    ...baseEvent,
    sequence: 1,
    eventType: InteractionEventType.KeyPressed,
    payload: { key: 'Enter' }
  });
  assert.equal(r1.accepted, true);
  assert.equal(executedEvents.length, 3);
  assert.deepEqual(executedEvents[1], { type: 'KeyPressed', k: 'Enter' });
  assert.deepEqual(executedEvents[2], { type: 'PointerMove', x: 400, y: 300 });

  // Session must now be Active
  assert.equal(session.getState(), SessionState.Active);

  session.destroy();
});

test('NativeDesktopInteractionTarget - Bridge delegation, normalization and immediate revocation', async () => {
  const bridgeCalls = [];
  globalThis.window = {
    desktopInteraction: {
      isAvailable: true,
      movePointer: async (sessId, displayId, x, y) => {
        bridgeCalls.push({ method: 'movePointer', sessId, displayId, x, y });
        return true;
      },
      pointerDown: async (sessId, button, displayId, x, y) => {
        bridgeCalls.push({ method: 'pointerDown', sessId, button, displayId, x, y });
        return true;
      },
      pointerUp: async (sessId, button, displayId, x, y) => {
        bridgeCalls.push({ method: 'pointerUp', sessId, button, displayId, x, y });
        return true;
      },
      scroll: async (sessId, deltaY, deltaX) => {
        bridgeCalls.push({ method: 'scroll', sessId, deltaY, deltaX });
        return true;
      },
      keyDown: async (sessId, key) => {
        bridgeCalls.push({ method: 'keyDown', sessId, key });
        return true;
      },
      keyUp: async (sessId, key) => {
        bridgeCalls.push({ method: 'keyUp', sessId, key });
        return true;
      },
      revokeSession: async () => {
        bridgeCalls.push({ method: 'revokeSession' });
        return true;
      }
    }
  };

  const target = new NativeDesktopInteractionTarget({ sessionId: 'sess-100', displayId: 'disp-2' });

  // Move pointer with normalized values
  target.pointerMoveNormalized(0.45, 0.85);
  // Pointer down with button 2 (right click)
  target.pointerDownNormalized(2, 0.45, 0.85);
  // Pointer up
  target.pointerUpNormalized(2, 0.45, 0.85);
  // Scroll
  target.scroll(1.2);
  // Key press and release
  target.keyPressed('Enter');
  target.keyReleased('Enter');

  // Deactivate / Revoke
  target.deactivate();

  // Subsequent events must be ignored
  target.pointerMoveNormalized(0.9, 0.9);

  // Allow async promises to resolve
  await new Promise((r) => setTimeout(r, 10));

  assert.equal(bridgeCalls.length, 7);
  assert.deepEqual(bridgeCalls[0], { method: 'movePointer', sessId: 'sess-100', displayId: 'disp-2', x: 0.45, y: 0.85 });
  assert.deepEqual(bridgeCalls[1], { method: 'pointerDown', sessId: 'sess-100', button: 2, displayId: 'disp-2', x: 0.45, y: 0.85 });
  assert.deepEqual(bridgeCalls[2], { method: 'pointerUp', sessId: 'sess-100', button: 2, displayId: 'disp-2', x: 0.45, y: 0.85 });
  assert.deepEqual(bridgeCalls[3], { method: 'scroll', sessId: 'sess-100', deltaY: 120, deltaX: 0 });
  assert.deepEqual(bridgeCalls[4], { method: 'keyDown', sessId: 'sess-100', key: 'Enter' });
  assert.deepEqual(bridgeCalls[5], { method: 'keyUp', sessId: 'sess-100', key: 'Enter' });
  assert.deepEqual(bridgeCalls[6], { method: 'revokeSession' });

  delete globalThis.window;
});

test('CoordinateMapper - Mapping to specific physical SharedDisplay bounds', () => {
  const displaySecondary = {
    id: 2,
    x: 1920,
    y: 0,
    width: 2560,
    height: 1440,
    scaleFactor: 1.25
  };

  const mapper = new CoordinateMapper({ width: 1280, height: 720 }, { width: 16, height: 9 }, displaySecondary);

  // Center coordinate [0.5, 0.5] on secondary monitor
  const mapped = mapper.mapNormalizedToDisplayPixels(0.5, 0.5);
  assert.equal(mapped.screenX, 1920 + 1280); // 3200
  assert.equal(mapped.screenY, 720);
  assert.equal(mapped.display.id, 2);
});

