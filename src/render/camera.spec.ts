import { describe, expect, it } from 'vitest';
import { Camera } from './camera';

describe('Camera', () => {
  it('preserves the world point beneath a zoom cursor', () => {
    const camera = new Camera({ minX: -3000, minY: 0, maxX: 3000, maxY: 3040 }, 800, 600);
    const before = camera.screenToWorld(250, 200);
    camera.zoomAt(1.5, 250, 200);
    expect(camera.screenToWorld(250, 200)).toEqual(before);
  });

  it('clamps panning to map bounds', () => {
    const camera = new Camera({ minX: 0, minY: 0, maxX: 2000, maxY: 2000 }, 800, 600);
    camera.panBy(-100000, -100000);
    expect(camera.view.x).toBe(1600);
    expect(camera.view.y).toBe(1700);
  });
});
