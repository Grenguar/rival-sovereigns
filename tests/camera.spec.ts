import { describe, expect, it } from 'vitest';
import { Camera, MAX_ZOOM, MIN_ZOOM } from '../src/render/camera';

const BOUNDS = { minX: -3072, minY: 0, maxX: 3072, maxY: 3072 };
const camera = (zoom = 1): Camera => new Camera(BOUNDS, 1440, 900, zoom);

describe('camera', () => {
  it('holds the point under the cursor still while zooming', () => {
    const c = camera();
    const cursor = { x: 1100, y: 240 };
    const before = c.screenToWorld(cursor.x, cursor.y);

    c.zoomAt(1.1, cursor.x, cursor.y);
    c.zoomAt(1.1, cursor.x, cursor.y);
    const after = c.screenToWorld(cursor.x, cursor.y);

    // Zooming away from the cursor is the difference between a camera that feels
    // direct and one the player has to chase around with a drag after every notch.
    expect(after.x).toBeCloseTo(before.x, 6);
    expect(after.y).toBeCloseTo(before.y, 6);
  });

  it('refuses to zoom past its limits, however hard it is pushed', () => {
    const c = camera();
    for (let i = 0; i < 40; i++) c.zoomAt(1.5, 720, 450);
    expect(c.zoom).toBe(MAX_ZOOM);
    for (let i = 0; i < 80; i++) c.zoomAt(1 / 1.5, 720, 450);
    expect(c.zoom).toBe(MIN_ZOOM);
  });

  it('never shows ground beyond the map, at any zoom', () => {
    for (const zoom of [MIN_ZOOM, 0.8, 1, 1.7, MAX_ZOOM]) {
      const c = camera(zoom);
      c.panBy(-100_000, -100_000);
      const bottomRight = c.screenToWorld(1440, 900);
      expect(bottomRight.x, `zoom ${String(zoom)}`).toBeLessThanOrEqual(BOUNDS.maxX + 0.001);
      expect(bottomRight.y, `zoom ${String(zoom)}`).toBeLessThanOrEqual(BOUNDS.maxY + 0.001);

      c.panBy(200_000, 200_000);
      const topLeft = c.screenToWorld(0, 0);
      expect(topLeft.x, `zoom ${String(zoom)}`).toBeGreaterThanOrEqual(BOUNDS.minX - 0.001);
      expect(topLeft.y, `zoom ${String(zoom)}`).toBeGreaterThanOrEqual(BOUNDS.minY - 0.001);
    }
  });

  it('pans by a screen distance, not a world one', () => {
    const zoomedIn = camera(2);
    const zoomedOut = camera(0.5);
    const startIn = zoomedIn.view.x;
    const startOut = zoomedOut.view.x;

    zoomedIn.panBy(-100, 0);
    zoomedOut.panBy(-100, 0);

    // A drag of 100 screen pixels must move the map 100 screen pixels whatever the
    // zoom, so the world stays glued to the pointer.
    expect(zoomedIn.view.x - startIn).toBeCloseTo(100 / 2, 6);
    expect(zoomedOut.view.x - startOut).toBeCloseTo(100 / 0.5, 6);
  });

  it('round-trips screen and world coordinates', () => {
    const c = camera(1.4);
    c.panBy(-321, 210);
    const world = c.screenToWorld(400, 650);
    const screen = c.worldToScreen(world.x, world.y);
    expect(screen.x).toBeCloseTo(400, 6);
    expect(screen.y).toBeCloseTo(650, 6);
  });
});
