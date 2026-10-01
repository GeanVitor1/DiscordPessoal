import { InteractionEventType } from './protocol.js';

/**
 * Validates the strict sequence:
 * 1. Validate session
 * 2. Validate participant
 * 3. Validate authorization
 * 4. Validate token
 * 5. Validate session state
 * 6. Validate payload & rate limit
 */
export class InteractionValidator {
  /**
   * @param {object} options
   * @param {number} [options.maxEventsPerSecond=60] - Rate limiting: maximum events per second per participant
   * @param {number} [options.burstCapacity=100] - Rate limiting: token bucket capacity
   */
  constructor({ maxEventsPerSecond = 60, burstCapacity = 100 } = {}) {
    this.maxEventsPerSecond = maxEventsPerSecond;
    this.burstCapacity = burstCapacity;
    this.rateBuckets = new Map(); // participantId -> { tokens, lastRefill }
  }

  /**
   * Validates an event against the current active session
   * @param {object} event - Event packet
   * @param {import('./InteractionSession').InteractionSession} session - Current session instance
   * @returns {{ valid: boolean, error?: string, code?: string }}
   */
  validate(event, session) {
    // 1. Validar sessão
    if (!session || typeof session !== 'object') {
      return { valid: false, error: 'Session does not exist', code: 'INVALID_SESSION' };
    }
    if (!event || typeof event !== 'object') {
      return { valid: false, error: 'Event object is invalid or empty', code: 'INVALID_EVENT' };
    }
    if (!event.sessionId || event.sessionId !== session.sessionId) {
      return { valid: false, error: 'Event sessionId does not match current session', code: 'SESSION_MISMATCH' };
    }

    // 2. Validar participante
    if (!event.participantId) {
      return { valid: false, error: 'Participant ID is missing in event', code: 'MISSING_PARTICIPANT' };
    }
    // Only guestId (the authorized interactor) is permitted to send interaction events
    if (event.participantId !== session.guestId) {
      return { valid: false, error: `Participant ${event.participantId} is not the authorized interactor`, code: 'UNAUTHORIZED_PARTICIPANT' };
    }

    // 3. Validar autorização
    if (!session.isAuthorized()) {
      return { valid: false, error: `Session is not in authorized state (current: ${session.getState()})`, code: 'NOT_AUTHORIZED' };
    }

    // 4. Validar token
    if (!event.token || event.token !== session.token) {
      return { valid: false, error: 'Invalid or missing authentication token', code: 'INVALID_TOKEN' };
    }

    // 5. Validar estado da sessão
    const state = session.getState();
    if (state !== 'Authorized' && state !== 'Active') {
      return { valid: false, error: `Events are only accepted in Authorized or Active state (current: ${state})`, code: 'INVALID_STATE' };
    }

    // 6. Validar payload estrutural e tipo
    const payloadResult = this._validatePayload(event);
    if (!payloadResult.valid) {
      return payloadResult;
    }

    // Rate Limiting (Token Bucket)
    if (!this._checkRateLimit(event.participantId)) {
      return { valid: false, error: 'Rate limit exceeded for participant', code: 'RATE_LIMIT_EXCEEDED' };
    }

    return { valid: true };
  }

  _validatePayload(event) {
    const { eventType, payload } = event;
    if (!eventType || !InteractionEventType[eventType]) {
      return { valid: false, error: `Unsupported or unknown eventType: ${eventType}`, code: 'UNKNOWN_EVENT_TYPE' };
    }

    if (!payload || typeof payload !== 'object') {
      return { valid: false, error: 'Payload must be an object', code: 'INVALID_PAYLOAD' };
    }

    switch (eventType) {
      case InteractionEventType.PointerMove:
        if (typeof payload.x !== 'number' || typeof payload.y !== 'number' || isNaN(payload.x) || isNaN(payload.y)) {
          return { valid: false, error: 'PointerMove requires numeric x and y', code: 'INVALID_PAYLOAD_COORDINATES' };
        }
        if (payload.x < 0 || payload.x > 1 || payload.y < 0 || payload.y > 1) {
          return { valid: false, error: 'PointerMove coordinates must be normalized between 0 and 1', code: 'COORDINATES_OUT_OF_BOUNDS' };
        }
        break;

      case InteractionEventType.PointerDown:
      case InteractionEventType.PointerUp:
        if (typeof payload.button !== 'number') {
          return { valid: false, error: `${eventType} requires numeric button code`, code: 'INVALID_PAYLOAD_BUTTON' };
        }
        if (payload.x !== undefined && (typeof payload.x !== 'number' || payload.x < 0 || payload.x > 1)) {
          return { valid: false, error: 'Coordinates x must be normalized between 0 and 1', code: 'COORDINATES_OUT_OF_BOUNDS' };
        }
        if (payload.y !== undefined && (typeof payload.y !== 'number' || payload.y < 0 || payload.y > 1)) {
          return { valid: false, error: 'Coordinates y must be normalized between 0 and 1', code: 'COORDINATES_OUT_OF_BOUNDS' };
        }
        break;

      case InteractionEventType.Scroll:
        if (typeof payload.delta !== 'number' || isNaN(payload.delta)) {
          return { valid: false, error: 'Scroll requires numeric delta', code: 'INVALID_PAYLOAD_DELTA' };
        }
        break;

      case InteractionEventType.KeyPressed:
      case InteractionEventType.KeyReleased:
        if (typeof payload.key !== 'string' || payload.key.length === 0 || payload.key.length > 32) {
          return { valid: false, error: `${eventType} requires valid string key (max 32 chars)`, code: 'INVALID_PAYLOAD_KEY' };
        }
        break;
    }

    return { valid: true };
  }

  _checkRateLimit(participantId) {
    const now = Date.now();
    let bucket = this.rateBuckets.get(participantId);

    if (!bucket) {
      bucket = { tokens: this.burstCapacity, lastRefill: now };
      this.rateBuckets.set(participantId, bucket);
    } else {
      const elapsed = (now - bucket.lastRefill) / 1000;
      bucket.tokens = Math.min(this.burstCapacity, bucket.tokens + elapsed * this.maxEventsPerSecond);
      bucket.lastRefill = now;
    }

    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      return true;
    }
    return false;
  }

  reset() {
    this.rateBuckets.clear();
  }
}
