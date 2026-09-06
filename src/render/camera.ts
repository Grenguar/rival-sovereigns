export interface CameraBounds {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

export interface CameraView {
  readonly x: number;
  readonly y: number;
  readonly zoom: number;
  readonly width: number;
  readonly height: number;
}

/** Zoom limits. Exported so the UI can disable its own controls at the stops. */
export const MIN_ZOOM = 0.5;
export const MAX_ZOOM = 2.5;

/** A screen-space camera; world-space conversion stays in core/spatial/iso.ts. */
export class Camera {
  private centerX: number;
  private centerY: number;
  private viewportWidth: number;
  private viewportHeight: number;
  private _zoom: number;
  private readonly bounds: CameraBounds;

  constructor(bounds: CameraBounds, width: number, height: number, zoom = 1) {
    this.bounds = bounds;
    this.viewportWidth = width;
    this.viewportHeight = height;
    this._zoom = clamp(zoom, MIN_ZOOM, MAX_ZOOM);
    this.centerX = (bounds.minX + bounds.maxX) / 2;
    this.centerY = (bounds.minY + bounds.maxY) / 2;
    this.clamp();
  }

  get zoom(): number { return this._zoom; }

  get view(): CameraView {
    return { x: this.centerX, y: this.centerY, zoom: this._zoom, width: this.viewportWidth, height: this.viewportHeight };
  }

  /**
   * Centres the view on a screen-space point.
   *
   * The default is the middle of the map bounds, which on Mission 01 puts the
   * player's kingdom off in a corner on load. Where the player's things are is not
   * the same place as the middle of the world.
   */
  centerOn(screenX: number, screenY: number): void {
    this.centerX = screenX;
    this.centerY = screenY;
    this.clamp();
  }

  resize(width: number, height: number): void {
    this.viewportWidth = Math.max(1, width);
    this.viewportHeight = Math.max(1, height);
    this.clamp();
  }

  panBy(screenDx: number, screenDy: number): void {
    this.centerX -= screenDx / this._zoom;
    this.centerY -= screenDy / this._zoom;
    this.clamp();
  }

  /** Zooms about the middle of the viewport — what a keyboard or a button means. */
  zoomBy(factor: number): void {
    this.zoomAt(factor, this.viewportWidth / 2, this.viewportHeight / 2);
  }

  zoomAt(factor: number, screenX: number, screenY: number): void {
    const before = this.screenToWorld(screenX, screenY);
    this._zoom = clamp(this._zoom * factor, MIN_ZOOM, MAX_ZOOM);
    const after = this.screenToWorld(screenX, screenY);
    this.centerX += before.x - after.x;
    this.centerY += before.y - after.y;
    this.clamp();
  }

  worldToScreen(x: number, y: number): { x: number; y: number } {
    return { x: (x - this.centerX) * this._zoom + this.viewportWidth / 2, y: (y - this.centerY) * this._zoom + this.viewportHeight / 2 };
  }

  screenToWorld(x: number, y: number): { x: number; y: number } {
    return { x: (x - this.viewportWidth / 2) / this._zoom + this.centerX, y: (y - this.viewportHeight / 2) / this._zoom + this.centerY };
  }

  containsWorld(x: number, y: number, margin = 32): boolean {
    const halfWidth = this.viewportWidth / this._zoom / 2 + margin;
    const halfHeight = this.viewportHeight / this._zoom / 2 + margin;
    return x >= this.centerX - halfWidth && x <= this.centerX + halfWidth && y >= this.centerY - halfHeight && y <= this.centerY + halfHeight;
  }

  private clamp(): void {
    const halfWidth = this.viewportWidth / this._zoom / 2;
    const halfHeight = this.viewportHeight / this._zoom / 2;
    this.centerX = clampToBounds(this.centerX, this.bounds.minX, this.bounds.maxX, halfWidth);
    this.centerY = clampToBounds(this.centerY, this.bounds.minY, this.bounds.maxY, halfHeight);
  }
}

function clamp(value: number, min: number, max: number): number { return Math.max(min, Math.min(max, value)); }
function clampToBounds(value: number, min: number, max: number, halfViewport: number): number {
  if (max - min <= halfViewport * 2) return (min + max) / 2;
  return clamp(value, min + halfViewport, max - halfViewport);
}
