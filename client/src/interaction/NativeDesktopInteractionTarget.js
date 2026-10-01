import { IInteractionTarget } from './IInteractionTarget.js';

/**
 * NativeDesktopInteractionTarget
 * Implementation of IInteractionTarget that translates interaction events
 * into real OS hardware inputs via the secure desktop bridge (window.desktopInteraction).
 */
export class NativeDesktopInteractionTarget extends IInteractionTarget {
  /**
   * @param {object} options
   * @param {string} options.sessionId
   * @param {string|null} [options.displayId]
   * @param {Function} [options.onAudit]
   */
  constructor({ sessionId, displayId = null, onAudit = null } = {}) {
    super();
    this.sessionId = sessionId;
    this.displayId = displayId;
    this.onAudit = onAudit;
    this.isActive = true;

    // Check availability of the preload bridge
    this.bridgeAvailable = typeof window !== 'undefined' && Boolean(window.desktopInteraction?.isAvailable);
    if (!this.bridgeAvailable) {
      console.warn('[NativeDesktopInteractionTarget] window.desktopInteraction não está disponível.');
    }
  }

  setSessionId(sessionId) {
    this.sessionId = sessionId;
  }

  setDisplayId(displayId) {
    this.displayId = displayId;
  }

  deactivate() {
    this.isActive = false;
    if (this.bridgeAvailable) {
      window.desktopInteraction.revokeSession?.().catch(() => {});
    }
  }

  /**
   * pointerMove receives coordinates.
   * If normX/normY are present in 3rd/4th arg (from receiver), we prefer the pure [0..1] normalized values.
   */
  pointerMove(pixelX, pixelY, normX, normY) {
    if (!this.isActive || !this.bridgeAvailable || !this.sessionId) return;
    
    let x = normX !== undefined ? Number(normX) : Number(pixelX);
    let y = normY !== undefined ? Number(normY) : Number(pixelY);

    // If coordinates were passed > 1 without normalized values, convert or clamp
    if (x > 1 || y > 1) {
      // It's likely pixels, clamped to 0..1 if we assume container dimensions
      x = Math.max(0, Math.min(1, x / 1920));
      y = Math.max(0, Math.min(1, y / 1080));
    } else {
      x = Math.max(0, Math.min(1, x));
      y = Math.max(0, Math.min(1, y));
    }

    window.desktopInteraction.movePointer(this.sessionId, this.displayId, x, y).catch((err) => {
      console.error('[NativeDesktopInteractionTarget] pointerMove erro:', err);
    });
  }

  pointerMoveNormalized(normX, normY) {
    this.pointerMove(0, 0, normX, normY);
  }

  /**
   * @param {number} button 0 = left, 1 = middle, 2 = right
   */
  pointerDown(button, pixelX, pixelY, normX, normY) {
    if (!this.isActive || !this.bridgeAvailable || !this.sessionId) return;

    const btn = Number(button);
    let x = normX !== undefined ? Number(normX) : (pixelX !== undefined && pixelX <= 1 ? Number(pixelX) : undefined);
    let y = normY !== undefined ? Number(normY) : (pixelY !== undefined && pixelY <= 1 ? Number(pixelY) : undefined);

    if (x !== undefined) x = Math.max(0, Math.min(1, x));
    if (y !== undefined) y = Math.max(0, Math.min(1, y));

    window.desktopInteraction.pointerDown(this.sessionId, btn, this.displayId, x, y).catch((err) => {
      console.error('[NativeDesktopInteractionTarget] pointerDown erro:', err);
    });
  }

  pointerDownNormalized(button, normX, normY) {
    this.pointerDown(button, 0, 0, normX, normY);
  }

  /**
   * @param {number} button 0 = left, 1 = middle, 2 = right
   */
  pointerUp(button, pixelX, pixelY, normX, normY) {
    if (!this.isActive || !this.bridgeAvailable || !this.sessionId) return;

    const btn = Number(button);
    let x = normX !== undefined ? Number(normX) : (pixelX !== undefined && pixelX <= 1 ? Number(pixelX) : undefined);
    let y = normY !== undefined ? Number(normY) : (pixelY !== undefined && pixelY <= 1 ? Number(pixelY) : undefined);

    if (x !== undefined) x = Math.max(0, Math.min(1, x));
    if (y !== undefined) y = Math.max(0, Math.min(1, y));

    window.desktopInteraction.pointerUp(this.sessionId, btn, this.displayId, x, y).catch((err) => {
      console.error('[NativeDesktopInteractionTarget] pointerUp erro:', err);
    });
  }

  pointerUpNormalized(button, normX, normY) {
    this.pointerUp(button, 0, 0, normX, normY);
  }


  /**
   * @param {number} delta Wheel delta
   * @param {number} [normX]
   * @param {number} [normY]
   */
  scroll(delta, normX, normY) {
    if (!this.isActive || !this.bridgeAvailable || !this.sessionId) return;

    // deltaY: typical wheel is 100~120 per step
    const deltaY = Number(delta) * 100;
    window.desktopInteraction.scroll(this.sessionId, deltaY, 0).catch((err) => {
      console.error('[NativeDesktopInteractionTarget] scroll erro:', err);
    });
  }

  /**
   * @param {string} key Key identifier (e.g. 'A', 'Enter', 'ArrowUp', 'Tab')
   */
  keyPressed(key) {
    if (!this.isActive || !this.bridgeAvailable || !this.sessionId) return;
    if (typeof key !== 'string') return;

    window.desktopInteraction.keyDown(this.sessionId, key).catch((err) => {
      console.error('[NativeDesktopInteractionTarget] keyDown erro:', err);
    });
  }

  /**
   * @param {string} key Key identifier
   */
  keyReleased(key) {
    if (!this.isActive || !this.bridgeAvailable || !this.sessionId) return;
    if (typeof key !== 'string') return;

    window.desktopInteraction.keyUp(this.sessionId, key).catch((err) => {
      console.error('[NativeDesktopInteractionTarget] keyUp erro:', err);
    });
  }

  destroy() {
    this.deactivate();
  }
}
