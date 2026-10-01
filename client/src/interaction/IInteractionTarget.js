/**
 * Base interface / contract for an interaction target.
 * Matches:
 * void PointerMove(double x, double y);
 * void PointerDown(int button);
 * void PointerUp(int button);
 * void Scroll(double delta);
 * void KeyPressed(string key);
 * void KeyReleased(string key);
 */
export class IInteractionTarget {
  pointerMove(x, y) {
    throw new Error('Not implemented: pointerMove(x, y)');
  }

  pointerDown(button, x, y) {
    throw new Error('Not implemented: pointerDown(button, x, y)');
  }

  pointerUp(button, x, y) {
    throw new Error('Not implemented: pointerUp(button, x, y)');
  }

  scroll(delta, x, y) {
    throw new Error('Not implemented: scroll(delta, x, y)');
  }

  keyPressed(key) {
    throw new Error('Not implemented: keyPressed(key)');
  }

  keyReleased(key) {
    throw new Error('Not implemented: keyReleased(key)');
  }
}
