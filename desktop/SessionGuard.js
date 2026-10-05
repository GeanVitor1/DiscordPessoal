export class SessionGuard {
  constructor({ now = Date.now, onRevoke = () => {} } = {}) {
    this.now = now;
    this.onRevoke = onRevoke;
    this.session = null;
  }
  authorize({ sessionId, guestId, displayId, ownerId }) {
    this.revoke('Nova sessão');
    this.session = { sessionId, guestId, displayId: String(displayId), ownerId, deadline: this.now() + 6500 };
  }
  accepts(sessionId, ownerId, displayId) {
    if (this.session && this.now() >= this.session.deadline) this.revoke('Conexão interrompida');
    return Boolean(this.session && this.session.sessionId === sessionId && this.session.ownerId === ownerId && (displayId === undefined || String(displayId) === this.session.displayId));
  }
  heartbeat(sessionId, ownerId) {
    if (!this.accepts(sessionId, ownerId)) return false;
    this.session.deadline = this.now() + 6500;
    return true;
  }
  activate(sessionId, ownerId, guestId, token) {
    if (!this.accepts(sessionId, ownerId) || this.session.active || guestId !== this.session.guestId || typeof token !== 'string' || !/^[\w-]{32,100}$/.test(token)) return false;
    this.session.token = token;
    this.session.active = true;
    this.session.lastSequence = -1;
    return true;
  }
  acceptsInput(sessionId, ownerId, displayId, credentials) {
    if (!this.accepts(sessionId, ownerId, displayId) || !this.session.active || !credentials || credentials.token !== this.session.token || credentials.guestId !== this.session.guestId || !Number.isSafeInteger(credentials.sequence) || credentials.sequence <= this.session.lastSequence) return false;
    this.session.lastSequence = credentials.sequence;
    return true;
  }
  revoke(reason = 'Assistência encerrada') {
    const old = this.session;
    this.session = null;
    if (old) this.onRevoke(old, reason);
  }
}
