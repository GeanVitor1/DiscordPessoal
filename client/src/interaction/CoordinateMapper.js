/**
 * Maps normalized coordinates [0, 1] to target visual area dimensions (pixel space)
 * taking into account aspect ratios, letterboxing/pillarboxing (object-fit: contain),
 * and multiple sub-areas / interactive zones.
 */
export class CoordinateMapper {
  /**
   * @param {object} targetBounds - Visual element rect { width, height }
   * @param {object} [contentAspectRatio] - Optional source aspect ratio { width, height }
   */
  /**
   * @param {object} targetBounds - Visual element rect { width, height }
   * @param {object} [contentAspectRatio] - Optional source aspect ratio { width, height }
   * @param {object} [sharedDisplay] - Optional physical shared display info { id, x, y, width, height, scaleFactor }
   */
  constructor(targetBounds = { width: 1, height: 1 }, contentAspectRatio = null, sharedDisplay = null) {
    this.targetBounds = { width: Math.max(1, targetBounds.width), height: Math.max(1, targetBounds.height) };
    this.contentAspectRatio = contentAspectRatio;
    this.sharedDisplay = sharedDisplay;
    this.interactionAreas = new Map(); // areaId -> { x, y, width, height, target } (all normalized [0..1])
  }

  setSharedDisplay(sharedDisplay) {
    this.sharedDisplay = sharedDisplay;
  }

  getSharedDisplay() {
    return this.sharedDisplay;
  }


  /**
   * Update the dimensions of the host visual area
   * @param {number} width 
   * @param {number} height 
   */
  updateBounds(width, height) {
    this.targetBounds = {
      width: Math.max(1, width),
      height: Math.max(1, height)
    };
  }

  /**
   * Register a sub-interactive area (e.g. multi-area interaction zones)
   * All coordinates are normalized [0..1] within the parent canvas
   */
  registerArea(areaId, { x, y, width, height, target }) {
    this.interactionAreas.set(areaId, { x, y, width, height, target });
  }

  unregisterArea(areaId) {
    this.interactionAreas.delete(areaId);
  }

  /**
   * Calculate effective active view area accounting for aspect ratio contain fit
   * @returns {{ offsetX: number, offsetY: number, renderedWidth: number, renderedHeight: number }}
   */
  getRenderViewport() {
    const { width: containerW, height: containerH } = this.targetBounds;

    if (!this.contentAspectRatio) {
      return {
        offsetX: 0,
        offsetY: 0,
        renderedWidth: containerW,
        renderedHeight: containerH
      };
    }

    const { width: aspectW, height: aspectH } = this.contentAspectRatio;
    const containerRatio = containerW / containerH;
    const contentRatio = aspectW / aspectH;

    let renderedWidth, renderedHeight, offsetX, offsetY;

    if (containerRatio > contentRatio) {
      // Pillarbox (black bars on left/right)
      renderedHeight = containerH;
      renderedWidth = containerH * contentRatio;
      offsetX = (containerW - renderedWidth) / 2;
      offsetY = 0;
    } else {
      // Letterbox (black bars on top/bottom)
      renderedWidth = containerW;
      renderedHeight = containerW / contentRatio;
      offsetX = 0;
      offsetY = (containerH - renderedHeight) / 2;
    }

    return { offsetX, offsetY, renderedWidth, renderedHeight };
  }

  /**
   * Map normalized coordinates (0..1) to target absolute pixel coordinates within container
   * @param {number} normX - 0..1
   * @param {number} normY - 0..1
   * @returns {{ pixelX: number, pixelY: number, insideViewport: boolean }}
   */
  mapNormalizedToPixels(normX, normY) {
    const clampedX = Math.max(0, Math.min(1, normX));
    const clampedY = Math.max(0, Math.min(1, normY));

    const viewport = this.getRenderViewport();
    const pixelX = viewport.offsetX + clampedX * viewport.renderedWidth;
    const pixelY = viewport.offsetY + clampedY * viewport.renderedHeight;

    return {
      pixelX,
      pixelY,
      insideViewport: true
    };
  }

  /**
   * Map normalized coordinates (0..1) directly to physical OS screen coordinates
   * taking into account multi-monitor offsets and display bounds
   * @param {number} normX - 0..1
   * @param {number} normY - 0..1
   * @returns {{ screenX: number, screenY: number, display: object|null }}
   */
  mapNormalizedToDisplayPixels(normX, normY) {
    const clampedX = Math.max(0, Math.min(1, normX));
    const clampedY = Math.max(0, Math.min(1, normY));

    if (this.sharedDisplay) {
      const { x = 0, y = 0, width = 1920, height = 1080 } = this.sharedDisplay;
      return {
        screenX: Math.round(x + clampedX * width),
        screenY: Math.round(y + clampedY * height),
        display: this.sharedDisplay
      };
    }

    return {
      screenX: Math.round(clampedX * 1920),
      screenY: Math.round(clampedY * 1080),
      display: null
    };
  }


  /**
   * Map local pixel coordinates (e.g. from mouse event on host container) back to normalized [0, 1]
   * @param {number} localPixelX 
   * @param {number} localPixelY 
   * @returns {{ normX: number, normY: number, insideViewport: boolean }}
   */
  mapPixelsToNormalized(localPixelX, localPixelY) {
    const viewport = this.getRenderViewport();

    const relX = localPixelX - viewport.offsetX;
    const relY = localPixelY - viewport.offsetY;

    const normX = Math.max(0, Math.min(1, relX / viewport.renderedWidth));
    const normY = Math.max(0, Math.min(1, relY / viewport.renderedHeight));

    const insideViewport = (
      localPixelX >= viewport.offsetX &&
      localPixelX <= viewport.offsetX + viewport.renderedWidth &&
      localPixelY >= viewport.offsetY &&
      localPixelY <= viewport.offsetY + viewport.renderedHeight
    );

    return { normX, normY, insideViewport };
  }

  /**
   * Finds which registered sub-area contains the normalized coordinates, if any
   * @param {number} normX 
   * @param {number} normY 
   * @returns {{ areaId: string, area: object, localNormX: number, localNormY: number } | null}
   */
  findArea(normX, normY) {
    for (const [areaId, area] of this.interactionAreas.entries()) {
      if (
        normX >= area.x &&
        normX <= area.x + area.width &&
        normY >= area.y &&
        normY <= area.y + area.height
      ) {
        const localNormX = (normX - area.x) / area.width;
        const localNormY = (normY - area.y) / area.height;
        return { areaId, area, localNormX, localNormY };
      }
    }
    return null;
  }
}
