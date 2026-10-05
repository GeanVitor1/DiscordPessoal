import { IInteractionTarget } from './IInteractionTarget.js';

// The existing native target forwards exclusively to the consented Windows helper.
// A command is applied only when IPC returns the helper's correlated acknowledgement.
export class NativeDesktopInteractionTarget extends IInteractionTarget {
  constructor({ sessionId, displayId = null, onAudit = null } = {}) {
    super(); Object.assign(this, { sessionId, displayId, onAudit });
    this.isActive = true;
    this.bridgeAvailable = typeof window !== 'undefined' && Boolean(window.desktopInteraction?.isAvailable);
  }
  setSessionId(id) { this.sessionId = id; }
  setDisplayId(id) { this.displayId = id; }
  setCanvas() { /* Native input never renders a cursor or modifies host DOM. */ }
  deactivate() {
    this.isActive = false;
    if (this.bridgeAvailable) window.desktopInteraction.revokeSession?.().catch(() => {});
  }
  destroy() { this.deactivate(); }
  async forward(method, args, credentials) {
    if (!this.isActive || !this.bridgeAvailable || !this.sessionId) return { success: false, code: 'INACTIVE' };
    try {
      const result = await window.desktopInteraction[method](this.sessionId, ...args, credentials);
      return result === true ? { success: true } : result || { success: false, nativeAck: 'ERROR', code: 'IPC_REJECTED' };
    } catch { return { success: false, nativeAck: 'ERROR', code: 'IPC_ERROR' }; }
  }
  pointerMove(pixelX, pixelY, normX = pixelX, normY = pixelY, credentials) {
    return this.forward('movePointer', [this.displayId, normX, normY], credentials);
  }
  pointerMoveNormalized(x, y, credentials) { return this.pointerMove(0, 0, x, y, credentials); }
  pointerDown(button, pixelX, pixelY, normX = pixelX, normY = pixelY, credentials) {
    return this.forward('pointerDown', [button, this.displayId, normX, normY], credentials);
  }
  pointerDownNormalized(button, x, y, credentials) { return this.pointerDown(button, 0, 0, x, y, credentials); }
  pointerUp(button, pixelX, pixelY, normX = pixelX, normY = pixelY, credentials) {
    return this.forward('pointerUp', [button, this.displayId, normX, normY], credentials);
  }
  pointerUpNormalized(button, x, y, credentials) { return this.pointerUp(button, 0, 0, x, y, credentials); }
  scroll(delta, x = .5, y = .5, deltaX = 0, credentials) {
    return this.forward('scroll', [delta * 100, deltaX * 100, this.displayId, x, y], credentials);
  }
  keyPressed(key, code, credentials) { return this.forward('keyDown', [key, code], credentials); }
  keyReleased(key, code, credentials) { return this.forward('keyUp', [key, code], credentials); }
  textInput(text, credentials) { return this.forward('textInput', [text], credentials); }
  executeEvent(event) {
    const p = event.payload, auth = { token: event.token, guestId: event.participantId, sequence: event.sequence };
    switch (event.eventType) {
      case 'PointerMove': return this.pointerMoveNormalized(p.x, p.y, auth);
      case 'PointerDown': return this.pointerDownNormalized(p.button, p.x, p.y, auth);
      case 'PointerUp': return this.pointerUpNormalized(p.button, p.x, p.y, auth);
      case 'Scroll': return this.scroll(p.delta, p.x ?? .5, p.y ?? .5, p.deltaX || 0, auth);
      case 'KeyPressed': return this.keyPressed(p.key, p.code, auth);
      case 'KeyReleased': return this.keyReleased(p.key, p.code, auth);
      case 'TextInput': return this.textInput(p.text, auth);
      default: return Promise.resolve({ success: false, code: 'UNKNOWN_INPUT' });
    }
  }
}
