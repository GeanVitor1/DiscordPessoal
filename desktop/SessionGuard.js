export class SessionGuard {
  constructor({ now = Date.now, onRevoke = () => {} } = {}) {
    this.now = now;
    this.onRevoke = onRevoke;
    this.session = null;
  }
  authorize({ sessionId, guestId, displayId, ownerId, clipboard = false, preparationMs = 6500 }) {
    this.revoke('Nova sessão');
    this.session = { sessionId, guestId, displayId: String(displayId), ownerId, clipboard:clipboard===true, deadline: this.now() + preparationMs };
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
  activate(sessionId, ownerId, guestId, token, connectionMs = 6500) {
    if (!this.accepts(sessionId, ownerId) || this.session.active || guestId !== this.session.guestId || typeof token !== 'string' || !/^[\w-]{32,100}$/.test(token)) return false;
    this.session.token = token;
    this.session.active = true;
    this.session.deadline = this.now() + connectionMs;
    this.session.lastSequence = -1;
    return true;
  }
  acceptsInput(sessionId, ownerId, displayId, credentials) {
    if (!this.accepts(sessionId, ownerId, displayId) || !this.session.active || !credentials || credentials.token !== this.session.token || credentials.guestId !== this.session.guestId || !Number.isSafeInteger(credentials.sequence) || credentials.sequence <= this.session.lastSequence) return false;
    this.session.lastSequence = credentials.sequence;
    return true;
  }
  inputRejection(sessionId, ownerId, displayId, credentials) {
    this.accepts(sessionId,ownerId,displayId); // Expire stale consent first.
    const s=this.session;
    if(!s)return 'SESSION_INACTIVE';
    if(s.sessionId !== sessionId)return 'SESSION_MISMATCH';
    if(s.ownerId !== ownerId)return 'OWNER_MISMATCH';
    if(displayId !== undefined && String(displayId) !== s.displayId)return 'DISPLAY_MISMATCH';
    if(!s.active)return 'SESSION_NOT_ACTIVATED';
    if(!credentials || credentials.token !== s.token)return 'TOKEN_MISMATCH';
    if(credentials.guestId !== s.guestId)return 'GUEST_MISMATCH';
    if(!Number.isSafeInteger(credentials.sequence) || credentials.sequence < 0)return 'INVALID_SEQUENCE';
    if(credentials.sequence <= s.lastSequence)return 'REPLAYED_INPUT';
    return 'INVALID_INPUT';
  }
  revoke(reason = 'Assistência encerrada') {
    const old = this.session;
    this.session = null;
    if (old) this.onRevoke(old, reason);
  }
}
