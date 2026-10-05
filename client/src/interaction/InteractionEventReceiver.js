import { InteractionEventType } from './protocol.js';
import { InteractionSerializer } from './InteractionSerializer.js';

/**
 * InteractionEventReceiver
 * Receives raw events from RealtimeTransport, handles:
 * - Deserialization
 * - 6-step Validation (via InteractionValidator)
 * - Sequence Ordering & Deduplication (jitter buffer)
 * - Coordinate Mapping (via CoordinateMapper)
 * - Dispatching to IInteractionTarget
 * - Audit logging
 */
export class InteractionEventReceiver {
  /**
   * @param {object} options
   * @param {import('./InteractionSession').InteractionSession} options.session
   * @param {import('./InteractionValidator').InteractionValidator} options.validator
   * @param {import('./CoordinateMapper').CoordinateMapper} options.coordinateMapper
   * @param {import('./IInteractionTarget').IInteractionTarget} options.target
   * @param {Function} [options.onAudit]
   */
  constructor({ session, validator, coordinateMapper, target, onAudit = null, onApplied = null }) {
    this.session = session;
    this.validator = validator;
    this.coordinateMapper = coordinateMapper;
    this.target = target;
    this.onAudit = onAudit;
    this.onApplied = onApplied;
    this.executionQueue = Promise.resolve();
    this.executionEpoch = 0;

    this.lastSequence = -1;
    this.seenSequences = new Set();
    this.reorderBuffer = []; // Buffer for out-of-order packets: [{ sequence, event }]
    this.maxBufferSize = 50;

    // Métricas e estatísticas em tempo real
    this.stats = {
      totalAccepted: 0,
      totalRejected: 0,
      totalOutOfOrder: 0,
      totalDropped: 0,
      lastLatencyMs: 0,
      lastSequence: -1,
      lastEventType: null
    };
  }

  getStats() {
    return { ...this.stats };
  }

  setSession(session) {
    this.session = session;
    this.resetSequence();
  }

  setTarget(target) {
    this.target = target;
  }

  setCoordinateMapper(mapper) {
    this.coordinateMapper = mapper;
  }

  resetSequence() {
    ++this.executionEpoch;
    clearTimeout(this.gapTimer);
    this.lastSequence = -1;
    this.seenSequences.clear();
    this.reorderBuffer = [];
  }

  /**
   * Main entry point when a raw packet arrives from RealtimeTransport (WebRTC DataChannel or socket)
   * @param {string|ArrayBuffer|Uint8Array|object} rawData 
   */
  receive(rawData) {
    let event;
    try {
      if (typeof rawData === 'object' && !(rawData instanceof ArrayBuffer) && !ArrayBuffer.isView(rawData)) {
        event = rawData;
      } else {
        event = InteractionSerializer.deserialize(rawData);
      }
    } catch (err) {
      this._audit('DESERIALIZATION_FAILED', { error: err.message });
      return { accepted: false, reason: err.message };
    }

    // 1 to 6 Validation pipeline
    const valResult = this.validator.validate(event, this.session);

    if (!valResult.valid) {
      this.stats.totalRejected++;
      const seqStr = event?.sequence !== undefined ? `#${event.sequence}` : '#?';
      const eventTypeStr = event?.eventType || 'Unknown';
      const formattedMsg = `${seqStr} ${eventTypeStr} rejected: ${valResult.error}`;
      this._audit('VALIDATION_FAILED', {
        code: valResult.code,
        error: valResult.error,
        sequence: event?.sequence,
        eventType: event?.eventType,
        logLine: formattedMsg
      });
      return { accepted: false, reason: valResult.error, code: valResult.code, logLine: formattedMsg };
    }

    // Protection against duplicate events & sequence ordering
    const { sequence } = event;
    if (!Number.isSafeInteger(sequence) || sequence < 0) return { accepted: false, code: 'INVALID_SEQUENCE' };
    if (typeof sequence === 'number') {
      if (this.seenSequences.has(sequence)) {
        this.stats.totalDropped++;
        const logLine = `#${sequence} ${event.eventType} rejected: duplicate sequence`;
        this._audit('DUPLICATE_EVENT_DROPPED', { sequence, eventType: event.eventType, logLine });
        return { accepted: false, reason: 'Duplicate event sequence', code: 'DUPLICATE_SEQUENCE', logLine };
      }
      this.seenSequences.add(sequence);
      if (this.seenSequences.size > 1000) {
        // Prune oldest sequences from memory
        const it = this.seenSequences.values();
        for (let i = 0; i < 200; i++) {
          this.seenSequences.delete(it.next().value);
        }
      }

      // If packet is older than last strictly processed sequence
      if (sequence < this.lastSequence) {
        this.stats.totalDropped++;
        this.stats.totalOutOfOrder++;
        const logLine = `#${sequence} ${event.eventType} rejected: stale out-of-order packet`;
        this._audit('OUT_OF_ORDER_DROPPED', { sequence, lastSequence: this.lastSequence, logLine });
        return { accepted: false, reason: 'Late/stale packet discarded', code: 'STALE_PACKET', logLine };
      }

      // If packet is out of order ahead, buffer it or process in order
      if (this.lastSequence >= 0 && sequence > this.lastSequence + 1) {
        this.stats.totalOutOfOrder++;
        this._insertIntoReorderBuffer(event);
        this._flushReorderBuffer();
        return { accepted: true, buffered: true };
      }

      // Packet is exact next sequence or initial sequence
      this._executeEvent(event);
      this.lastSequence = sequence;

      // Check if reorder buffer has subsequent events
      this._flushReorderBuffer();
      return { accepted: true };
    }

    // If no sequence number, process directly
    this._executeEvent(event);
    return { accepted: true };
  }

  _insertIntoReorderBuffer(event) {
    this.reorderBuffer.push(event);
    this.reorderBuffer.sort((a, b) => a.sequence - b.sequence);
    if (this.reorderBuffer.length > this.maxBufferSize) {
      // Discard oldest buffered item if buffer exceeds max limit
      const dropped = this.reorderBuffer.shift();
      this._audit('REORDER_BUFFER_OVERFLOW', { droppedSequence: dropped.sequence });
    }
    if (!this.gapTimer) this.gapTimer = setTimeout(() => {
      this.gapTimer = null;
      if (!this.session?.isAuthorized()) { this.reorderBuffer = []; return; }
      while (this.reorderBuffer.length) {
        const next = this.reorderBuffer.shift();
        if (next.sequence <= this.lastSequence) continue;
        this.stats.totalDropped += Math.max(0, next.sequence - this.lastSequence - 1);
        this._executeEvent(next);
        this.lastSequence = next.sequence;
      }
    }, 100);
  }

  _flushReorderBuffer() {
    while (this.reorderBuffer.length > 0) {
      const nextEvent = this.reorderBuffer[0];
      if (nextEvent.sequence === this.lastSequence + 1 || this.lastSequence === -1) {
        this.reorderBuffer.shift();
        this._executeEvent(nextEvent);
        this.lastSequence = nextEvent.sequence;
      } else {
        break;
      }
    }
  }

  _executeEvent(event) {
    if (!this.target || !this.session?.isAuthorized() || event.token !== this.session.token) return;

    // Transition session to Active on first executed interaction
    if (this.session && this.session.getState() === 'Authorized') {
      this.session.activate();
    } else if (this.session) {
      this.session.touch();
    }

    const { eventType, payload } = event;

    if (typeof this.target.executeEvent === 'function') {
      const epoch = this.executionEpoch;
      this.executionQueue = this.executionQueue.then(async () => {
        if (epoch !== this.executionEpoch || !this.session?.isAuthorized() || event.token !== this.session.token) return;
        let result;
        try { result = await this.target.executeEvent(event); }
        catch { result = { success: false, nativeAck: 'ERROR', code: 'NATIVE_ERROR' }; }
        if (epoch !== this.executionEpoch) return;
        this._audit(result?.success ? 'NATIVE_APPLIED' : 'NATIVE_REJECTED', { eventType, sequence: event.sequence, nativeAck: result?.nativeAck || 'ERROR', code: result?.code });
        this.onApplied?.(event, result);
      });
    } else {

    switch (eventType) {
      case InteractionEventType.PointerMove: {
        const { pixelX, pixelY } = this.coordinateMapper.mapNormalizedToPixels(payload.x, payload.y);
        // Se o target for desktop nativo, ele pode usar as coordenadas normalizadas (payload.x, payload.y)
        // ou coordenadas de pixels dependendo da sua assinatura:
        if (typeof this.target.pointerMoveNormalized === 'function') {
          this.target.pointerMoveNormalized(payload.x, payload.y, pixelX, pixelY);
        } else {
          this.target.pointerMove(pixelX, pixelY, payload.x, payload.y);
        }
        break;
      }

      case InteractionEventType.PointerDown: {
        let pixelX, pixelY;
        if (payload.x !== undefined && payload.y !== undefined) {
          const mapped = this.coordinateMapper.mapNormalizedToPixels(payload.x, payload.y);
          pixelX = mapped.pixelX;
          pixelY = mapped.pixelY;
        }
        if (typeof this.target.pointerDownNormalized === 'function') {
          this.target.pointerDownNormalized(payload.button, payload.x, payload.y, pixelX, pixelY);
        } else {
          this.target.pointerDown(payload.button, pixelX, pixelY, payload.x, payload.y);
        }
        break;
      }

      case InteractionEventType.PointerUp: {
        let pixelX, pixelY;
        if (payload.x !== undefined && payload.y !== undefined) {
          const mapped = this.coordinateMapper.mapNormalizedToPixels(payload.x, payload.y);
          pixelX = mapped.pixelX;
          pixelY = mapped.pixelY;
        }
        if (typeof this.target.pointerUpNormalized === 'function') {
          this.target.pointerUpNormalized(payload.button, payload.x, payload.y, pixelX, pixelY);
        } else {
          this.target.pointerUp(payload.button, pixelX, pixelY, payload.x, payload.y);
        }
        break;
      }

      case InteractionEventType.Scroll: {
        let pixelX, pixelY;
        if (payload.x !== undefined && payload.y !== undefined) {
          const mapped = this.coordinateMapper.mapNormalizedToPixels(payload.x, payload.y);
          pixelX = mapped.pixelX;
          pixelY = mapped.pixelY;
        }
        this.target.scroll(payload.delta, pixelX, pixelY);
        break;
      }


      case InteractionEventType.KeyPressed:
        this.target.keyPressed(payload.key, payload.code);
        break;

      case InteractionEventType.KeyReleased:
        this.target.keyReleased(payload.key, payload.code);
        break;
      case InteractionEventType.TextInput:
        this.target.textInput?.(payload.text);
        break;

      default:
        console.warn('Unhandled interaction eventType:', eventType);
        break;
    }

    }
    const latencyMs = event.timestamp ? Math.max(0, Date.now() - event.timestamp) : 0;
    this.stats.totalAccepted++;
    this.stats.lastLatencyMs = latencyMs;
    this.stats.lastSequence = event.sequence !== undefined ? event.sequence : this.stats.lastSequence;
    this.stats.lastEventType = eventType;

    const seqStr = event.sequence !== undefined ? `#${event.sequence}` : '#?';
    const logLine = `${seqStr} ${eventType} accepted ${latencyMs}ms`;

    this._audit('EVENT_PROCESSED', {
      eventType,
      sequence: event.sequence,
      timestamp: event.timestamp,
      latencyMs,
      logLine
    });
  }

  _audit(action, details = {}) {
    if (typeof this.onAudit === 'function') {
      try {
        this.onAudit({
          timestamp: Date.now(),
          action,
          sessionId: this.session?.sessionId,
          details
        });
      } catch (err) {
        console.error('Audit callback error:', err);
      }
    }
  }
}
