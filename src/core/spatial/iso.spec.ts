import { describe, expect, it } from 'vitest';
import type { EntityId } from '../types';
import { compareDepth, facingFromDelta, screenToWorld, worldToScreen } from './iso';

describe('isometric projection', () => {
  it('round-trips world coordinates exactly', () => {
    for (const point of [[0, 0], [3, -4], [11.25, 7.5]] as const) {
      const screen = worldToScreen(point[0], point[1]);
      expect(screenToWorld(screen.sx, screen.sy)).toEqual({ x: point[0], y: point[1] });
    }
  });

  it('uses stable depth and facing order', () => {
    expect(facingFromDelta(-4, 9)).toBe(5);
    expect(compareDepth(
      { x: 2, y: 3, id: 9 as EntityId },
      { x: 1, y: 4, id: 4 as EntityId },
    )).toBeGreaterThan(0);
  });
});
