import { SessionState } from './protocol.js';

/**
 * Manages the state machine, credentials, timeout, and revocation for an interactive session.
 */
export class InteractionSession {
  /**
   * @param {object} options
   * @param {string} options.sessionId
   * @param {string} options.hostId - Participant who owns the session / screen
   * @param {string} options.guestId - Participant authorized to interact
   * @param {string} options.token - Secret token or authorization hash
   * @param {number} [options.timeoutMs=60000] - Session inactivity timeout in ms
   * @param {Function} [options.onStateChange]
   * @param {Function} [options.onAudit] - Audit logger callback
   */
  constructor({
    sessionId,
    hostId,
    guestId,
    token,
    timeoutMs = 60000,
    onStateChange = null,
    onAudit = null
  }) {
    if (!sessionId || !hostId || !guestId || !token) {
      throw new Error('sessionId, hostId, guestId, and token are required');
    }

    this.sessionId = sessionId;
    this.hostId = hostId;
    this.guestId = guestId;
    this.token = token;
    this.timeoutMs = timeoutMs;
    this.state = SessionState.Created;
    this.createdAt = Date.now();
    this.lastActivityAt = Date.now();
    this.onStateChange = onStateChange;
    this.onAudit = onAudit;

    this._timer = null;
    this._resetTimeout();
    this._audit('SESSION_CREATED', { hostId, guestId, timeoutMs });
  }

  getState() {
    return this.state;
  }

  isAuthorized() {
    return this.state === SessionState.Authorized || this.state === SessionState.Active;
  }

  requestConsent() {
    if (this.state !== SessionState.Created) {
      throw new Error(`Cannot request consent from state ${this.state}`);
    }
    this._transitionTo(SessionState.WaitingForConsent, 'Waiting for host consent');
  }

  grantConsent() {
    if (this.state !== SessionState.WaitingForConsent && this.state !== SessionState.Created) {
      throw new Error(`Cannot grant consent from state ${this.state}`);
    }
    this._transitionTo(SessionState.Authorized, 'Host consent granted');
  }

  activate() {
    if (this.state !== SessionState.Authorized && this.state !== SessionState.Active) {
      throw new Error(`Cannot activate session from state ${this.state}`);
    }
    if (this.state !== SessionState.Active) {
      this._transitionTo(SessionState.Active, 'Session activated on first interaction');
    }
    this.touch();
  }

  revoke(reason = 'Explicit revocation') {
    if (this.state === SessionState.Finished || this.state === SessionState.Revoked) {
      return;
    }
    this._clearTimeout();
    this._transitionTo(SessionState.Revoked, reason);
  }

  finish(reason = 'Session finished naturally') {
    if (this.state === SessionState.Finished || this.state === SessionState.Revoked) {
      return;
    }
    this._clearTimeout();
    this._transitionTo(SessionState.Finished, reason);
  }

  touch() {
    if (this.state === SessionState.Revoked || this.state === SessionState.Finished) {
      return;
    }
    this.lastActivityAt = Date.now();
    this._resetTimeout();
  }

  _resetTimeout() {
    this._clearTimeout();
    if (this.timeoutMs > 0) {
      this._timer = setTimeout(() => {
        this._audit('SESSION_TIMEOUT', { timeoutMs: this.timeoutMs });
        this.finish('Session timed out due to inactivity');
      }, this.timeoutMs);
    }
  }

  _clearTimeout() {
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
    }
  }

  _transitionTo(newState, reason = '') {
    const oldState = this.state;
    this.state = newState;
    this._audit('STATE_CHANGE', { from: oldState, to: newState, reason });
    if (typeof this.onStateChange === 'function') {
      try {
        this.onStateChange(newState, oldState, reason);
      } catch (err) {
        console.error('Error in onStateChange callback:', err);
      }
    }
  }

  _audit(action, details = {}) {
    if (typeof this.onAudit === 'function') {
      try {
        this.onAudit({
          timestamp: Date.now(),
          sessionId: this.sessionId,
          action,
          state: this.state,
          details
        });
      } catch (err) {
        console.error('Audit callback error:', err);
      }
    }
  }

  destroy() {
    this._clearTimeout();
  }
}
