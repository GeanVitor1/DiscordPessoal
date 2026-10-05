import { IInteractionTarget } from './IInteractionTarget.js';

/**
 * CanvasInteractionTarget
 * Applies received interaction events onto an HTML5 Canvas or visual overlay area.
 * Renders remote cursor indicator, click ripples, scroll feedback, and key presses safely.
 */
export class CanvasInteractionTarget extends IInteractionTarget {
  /**
   * @param {HTMLCanvasElement|null} canvasElement
   */
  constructor(canvasElement = null) {
    super();
    this.canvas = canvasElement;
    this.ctx = canvasElement?.getContext('2d') || null;

    this.pointerPos = { x: 0, y: 0 };
    this.isPointerDown = false;
    this.lastButton = 0;
    this.activeKey = null;
    this.ripples = []; // Visual feedback ripples on click: [{ x, y, radius, alpha }]
    this.scrollEffect = 0; // Visual scroll impulse
    this.auditLog = []; // Recent executed actions

    this._animFrameId = null;
    this._startRenderLoop();
  }

  setCanvas(canvasElement) {
    if (this._animFrameId && typeof window !== 'undefined') window.cancelAnimationFrame(this._animFrameId);
    this._animFrameId = null;
    this.canvas = canvasElement;
    this.ctx = canvasElement?.getContext('2d') || null;
    this._startRenderLoop();
  }
  deactivate() {
    clearTimeout(this.textTimer);
    this.isPointerDown = false;
    this.activeKey = null;
    this.ripples = [];
    this.pointerPos = { x: -1, y: -1 };
    this.setCanvas(null);
  }

  pointerMove(x, y) {
    this.pointerPos = { x, y };
    this._logAction('PointerMove', { x: Math.round(x), y: Math.round(y) });
  }

  pointerDown(button, x, y) {
    this.isPointerDown = true;
    this.lastButton = button;
    if (x !== undefined && y !== undefined) {
      this.pointerPos = { x, y };
    }
    // Add ripple
    this.ripples.push({
      x: this.pointerPos.x,
      y: this.pointerPos.y,
      radius: 4,
      alpha: 1.0,
      button
    });
    this._logAction('PointerDown', { button, pos: this.pointerPos });
  }

  pointerUp(button, x, y) {
    this.isPointerDown = false;
    this.lastButton = button;
    if (x !== undefined && y !== undefined) {
      this.pointerPos = { x, y };
    }
    this._logAction('PointerUp', { button, pos: this.pointerPos });
  }

  scroll(delta, x, y) {
    if (x !== undefined && y !== undefined) {
      this.pointerPos = { x, y };
    }
    this.scrollEffect = Math.max(-30, Math.min(30, delta * 15));
    this._logAction('Scroll', { delta, pos: this.pointerPos });
  }

  keyPressed(key) {
    this.activeKey = key;
    this._logAction('KeyPressed', { key });
  }
  textInput(text) {
    this.activeKey = text.slice(-16);
    clearTimeout(this.textTimer);
    this.textTimer = setTimeout(() => { this.activeKey = null; }, 600);
  }

  keyReleased(key) {
    if (this.activeKey === key) {
      this.activeKey = null;
    }
    this._logAction('KeyReleased', { key });
  }

  _logAction(action, data) {
    this.auditLog.push({ timestamp: Date.now(), action, data });
    if (this.auditLog.length > 50) {
      this.auditLog.shift();
    }
  }

  _startRenderLoop() {
    if (!this.ctx) return;
    const render = () => {
      this._renderOverlay();
      if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
        this._animFrameId = window.requestAnimationFrame(render);
      }
    };
    if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
      this._animFrameId = window.requestAnimationFrame(render);
    }
  }

  _renderOverlay() {
    if (!this.canvas || !this.ctx) return;
    const ctx = this.ctx;
    const width = this.canvas.width;
    const height = this.canvas.height;

    ctx.clearRect(0, 0, width, height);

    // 1. Draw click ripples
    for (let i = this.ripples.length - 1; i >= 0; i--) {
      const r = this.ripples[i];
      ctx.save();
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.radius, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(88, 101, 242, ${r.alpha})`; // Discord blurple
      ctx.lineWidth = 2.5;
      ctx.stroke();
      ctx.restore();

      r.radius += 1.8;
      r.alpha -= 0.04;
      if (r.alpha <= 0) {
        this.ripples.splice(i, 1);
      }
    }

    // 2. Draw remote pointer cursor
    const { x, y } = this.pointerPos;
    if (x >= 0 && y >= 0 && x <= width && y <= height) {
      ctx.save();

      // Outer pointer glow/circle
      ctx.beginPath();
      ctx.arc(x, y, this.isPointerDown ? 10 : 8, 0, Math.PI * 2);
      ctx.fillStyle = this.isPointerDown ? 'rgba(235, 69, 158, 0.8)' : 'rgba(88, 101, 242, 0.7)';
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Pointer crosshair/arrow indicator
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + 14, y + 14);
      ctx.lineTo(x + 5, y + 14);
      ctx.lineTo(x, y + 20);
      ctx.closePath();
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.strokeStyle = '#23272a';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Indicator label
      ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
      ctx.roundRect ? ctx.roundRect(x + 12, y - 22, 90, 20, 4) : ctx.rect(x + 12, y - 22, 90, 20);
      ctx.fill();
      ctx.font = '11px sans-serif';
      ctx.fillStyle = '#57F287'; // Discord green
      ctx.fillText('Remoto Ativo', x + 16, y - 8);

      ctx.restore();
    }

    // 3. Draw key pressed indicator in bottom-right corner
    if (this.activeKey) {
      ctx.save();
      const badgeW = 120;
      const badgeH = 28;
      const bx = width - badgeW - 16;
      const by = height - badgeH - 16;

      ctx.fillStyle = 'rgba(43, 45, 49, 0.9)';
      ctx.roundRect ? ctx.roundRect(bx, by, badgeW, badgeH, 6) : ctx.rect(bx, by, badgeW, badgeH);
      ctx.fill();
      ctx.strokeStyle = '#5865F2';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.font = 'bold 12px monospace';
      ctx.fillStyle = '#ffffff';
      ctx.fillText(`Tecla: [${this.activeKey}]`, bx + 12, by + 18);
      ctx.restore();
    }

    // 4. Scroll indicator animation decay
    if (Math.abs(this.scrollEffect) > 0.1) {
      ctx.save();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
      const barH = 40;
      const barY = Math.max(10, Math.min(height - 50, (height / 2) + this.scrollEffect * 4));
      ctx.fillRect(width - 6, barY, 4, barH);
      ctx.restore();
      this.scrollEffect *= 0.85;
    }
  }

  destroy() {
    clearTimeout(this.textTimer);
    if (this._animFrameId && typeof window !== 'undefined' && typeof window.cancelAnimationFrame === 'function') {
      window.cancelAnimationFrame(this._animFrameId);
    }
    this.ripples = [];
  }
}
