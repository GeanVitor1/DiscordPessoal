import assert from 'node:assert/strict';
import test from 'node:test';

import {
  SessionState,
  InteractionEventType,
  createInteractionEvent,
  InteractionSession,
  InteractionValidator,
  CoordinateMapper,
  CanvasInteractionTarget,
  InteractionEventReceiver,
  RealtimeTransport
} from '../src/interaction/index.js';

/**
 * Mock Signaling Hub simulating Socket.io server delivering messages between two socket clients
 */
class MockSocketHub {
  constructor() {
    this.clients = new Map(); // socketId -> client instance
  }

  createClient(socketId) {
    const hub = this;
    const client = {
      id: socketId,
      listeners: new Map(),

      on(event, handler) {
        if (!this.listeners.has(event)) {
          this.listeners.set(event, new Set());
        }
        this.listeners.get(event).add(handler);
      },

      off(event, handler) {
        if (this.listeners.has(event)) {
          this.listeners.get(event).delete(handler);
        }
      },

      emit(event, data) {
        if (event === 'interaction_event') {
          const target = hub.clients.get(data.targetSocketId);
          if (target) {
            target._trigger('interaction_event', {
              fromSocketId: socketId,
              sessionId: data.sessionId,
              event: data.event
            });
          }
        } else if (event === 'interaction_signal_offer') {
          const target = hub.clients.get(data.targetSocketId);
          if (target) {
            target._trigger('interaction_signal_offer', {
              fromSocketId: socketId,
              sessionId: data.sessionId,
              sdp: data.sdp
            });
          }
        } else if (event === 'interaction_signal_answer') {
          const target = hub.clients.get(data.targetSocketId);
          if (target) {
            target._trigger('interaction_signal_answer', {
              fromSocketId: socketId,
              sessionId: data.sessionId,
              sdp: data.sdp
            });
          }
        } else if (event === 'interaction_signal_ice') {
          const target = hub.clients.get(data.targetSocketId);
          if (target) {
            target._trigger('interaction_signal_ice', {
              fromSocketId: socketId,
              sessionId: data.sessionId,
              candidate: data.candidate
            });
          }
        }
      },

      _trigger(event, payload) {
        const set = this.listeners.get(event);
        if (set) {
          for (const fn of set) {
            fn(payload);
          }
        }
      }
    };

    this.clients.set(socketId, client);
    return client;
  }
}

test('End-to-End Functional Test: User A (Host) and User B (Guest)', async () => {
  const hub = new MockSocketHub();
  const socketA = hub.createClient('socket_user_a');
  const socketB = hub.createClient('socket_user_b');

  const userA = { id: 'usr_alice', username: 'Alice (Host)' };
  const userB = { id: 'usr_bob', username: 'Bob (Guest)' };

  const sessionId = 'session_e2e_real_test_001';
  const sharedToken = 'auth_token_secret_xyz';

  // 1. Configuração do Usuário A (Host com tela compartilhada e alvo canvas controlado)
  const hostAuditLogs = [];
  const hostTarget = new CanvasInteractionTarget(null); // Headless target
  const hostMapper = new CoordinateMapper({ width: 1920, height: 1080 }, { width: 16, height: 9 });
  const hostValidator = new InteractionValidator({ maxEventsPerSecond: 100, burstCapacity: 100 });

  const hostSession = new InteractionSession({
    sessionId,
    hostId: userA.id,
    guestId: userB.id,
    token: sharedToken,
    timeoutMs: 60000,
    onAudit: (entry) => hostAuditLogs.push(entry)
  });

  // Host aceita a sessão de interação
  hostSession.grantConsent();
  assert.equal(hostSession.getState(), SessionState.Authorized);

  const hostReceiver = new InteractionEventReceiver({
    session: hostSession,
    validator: hostValidator,
    coordinateMapper: hostMapper,
    target: hostTarget,
    onAudit: (entry) => hostAuditLogs.push(entry)
  });

  const hostTransport = new RealtimeTransport({
    socket: socketA,
    sessionId,
    targetPeerSocketId: socketB.id,
    isInitiator: false,
    onMessage: (rawData) => {
      hostReceiver.receive(rawData);
    }
  });
  hostTransport.connect();

  // 2. Configuração do Usuário B (Guest interativo)
  const guestSession = new InteractionSession({
    sessionId,
    hostId: userA.id,
    guestId: userB.id,
    token: sharedToken,
    timeoutMs: 60000
  });
  guestSession.grantConsent();
  assert.equal(guestSession.getState(), SessionState.Authorized);

  const guestTransport = new RealtimeTransport({
    socket: socketB,
    sessionId,
    targetPeerSocketId: socketA.id,
    isInitiator: true
  });
  guestTransport.connect();

  let guestSequence = 0;
  const sendFromGuest = (eventType, payload) => {
    const packet = createInteractionEvent({
      sessionId,
      participantId: userB.id,
      token: sharedToken,
      sequence: guestSequence++,
      eventType,
      payload,
      timestamp: Date.now() - 15 // Simula 15ms de latência
    });
    return guestTransport.send(packet);
  };

  // --- Cenário de Interação Real ---
  // A. Movimento do ponteiro sobre a transmissão (coordenadas normalizadas 0..1)
  const moveSent = sendFromGuest(InteractionEventType.PointerMove, { x: 0.5, y: 0.5 });
  assert.ok(moveSent);

  // B. Click com botão esquerdo (PointerDown + PointerUp)
  const downSent = sendFromGuest(InteractionEventType.PointerDown, { button: 0, x: 0.5, y: 0.5 });
  assert.ok(downSent);
  const upSent = sendFromGuest(InteractionEventType.PointerUp, { button: 0, x: 0.5, y: 0.5 });
  assert.ok(upSent);

  // C. Scroll
  const scrollSent = sendFromGuest(InteractionEventType.Scroll, { delta: 3 });
  assert.ok(scrollSent);

  // D. Teclas pressionadas e soltas
  const keyPressSent = sendFromGuest(InteractionEventType.KeyPressed, { key: 'Control' });
  assert.ok(keyPressSent);
  const keyReleaseSent = sendFromGuest(InteractionEventType.KeyReleased, { key: 'Control' });
  assert.ok(keyReleaseSent);

  // --- Validação no Host (Alice) ---
  // O host deve ter recebido, mapeado e executado os eventos no CanvasTarget
  assert.deepEqual(hostTarget.pointerPos, { x: 960, y: 540 }); // 0.5 * 1920 = 960, 0.5 * 1080 = 540
  assert.equal(hostTarget.isPointerDown, false);
  assert.equal(hostTarget.lastButton, 0);
  assert.equal(hostTarget.ripples.length, 1); // Ripple visual de clique registrado!
  assert.equal(hostTarget.activeKey, null); // Tecla liberada

  // Validação de métricas do receiver
  const stats = hostReceiver.getStats();
  assert.equal(stats.totalAccepted, 6); // Move, Down, Up, Scroll, KeyPressed, KeyReleased
  assert.equal(stats.totalRejected, 0);
  assert.equal(stats.totalDropped, 0);
  assert.equal(stats.lastSequence, 5);
  assert.ok(stats.lastLatencyMs >= 15);

  // Validação dos logs de auditoria formatados
  const formattedLogs = hostAuditLogs
    .filter(log => log.details?.logLine)
    .map(log => log.details.logLine);

  assert.ok(formattedLogs.some(line => line.includes('#0 PointerMove accepted')));
  assert.ok(formattedLogs.some(line => line.includes('#1 PointerDown accepted')));
  assert.ok(formattedLogs.some(line => line.includes('#2 PointerUp accepted')));
  assert.ok(formattedLogs.some(line => line.includes('#3 Scroll accepted')));
  assert.ok(formattedLogs.some(line => line.includes('#4 KeyPressed accepted')));
  assert.ok(formattedLogs.some(line => line.includes('#5 KeyReleased accepted')));

  // --- Teste de Rejeição de Evento e Log Formatado ---
  // Simula evento com token incorreto
  const invalidTokenEvent = createInteractionEvent({
    sessionId,
    participantId: userB.id,
    token: 'invalid_token_forged',
    sequence: 6,
    eventType: InteractionEventType.KeyPressed,
    payload: { key: 'Escape' }
  });
  guestTransport.send(invalidTokenEvent);

  const rejectedLogs = hostAuditLogs.filter(
    log => log.action === 'VALIDATION_FAILED' && log.details?.logLine?.includes('rejected')
  );
  assert.ok(rejectedLogs.length > 0);
  assert.ok(rejectedLogs[0].details.logLine.includes('#6 KeyPressed rejected'));

  // --- Teste de Revogação Imediata ---
  hostSession.revoke('Revogado pelo host Alice');
  assert.equal(hostSession.getState(), SessionState.Revoked);

  // Envio após revogação deve ser rejeitado no host
  const postRevokeEvent = createInteractionEvent({
    sessionId,
    participantId: userB.id,
    token: sharedToken,
    sequence: 7,
    eventType: InteractionEventType.PointerMove,
    payload: { x: 0.1, y: 0.1 }
  });
  guestTransport.send(postRevokeEvent);

  const statsAfterRevoke = hostReceiver.getStats();
  assert.equal(statsAfterRevoke.totalAccepted, 6); // Não incrementou!
  assert.equal(statsAfterRevoke.totalRejected, 2); // 1 token inválido + 1 pós-revogação

  // Cleanup
  guestTransport.destroy();
  hostTransport.destroy();
  hostSession.destroy();
  guestSession.destroy();
});
