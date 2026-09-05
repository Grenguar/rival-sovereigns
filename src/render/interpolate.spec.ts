import { describe, expect, it } from 'vitest';
import { interpolatePosition } from './interpolate';

describe('tick interpolation', () => {
  it('uses tick alpha, clamped without reference to frame time', () => {
    const transform = { x: 10, y: 8, facing: 0 };
    const renderable = { frame: 0, tint: 0, prevX: 2, prevY: 4 };
    expect(interpolatePosition(transform, renderable, 0.5)).toEqual({ x: 6, y: 6 });
    expect(interpolatePosition(transform, renderable, 2)).toEqual({ x: 10, y: 8 });
  });
});
