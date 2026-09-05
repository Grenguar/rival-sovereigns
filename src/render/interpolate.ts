import type { Renderable, Transform } from '../core/types';

export interface InterpolatedPosition {
  readonly x: number;
  readonly y: number;
}

/** Visual-only tick interpolation. Simulation state always remains at the current tick. */
export function interpolatePosition(transform: Transform, renderable: Renderable | undefined, alpha: number): InterpolatedPosition {
  if (renderable === undefined) return { x: transform.x, y: transform.y };
  const clamped = Math.max(0, Math.min(1, alpha));
  return {
    x: renderable.prevX + (transform.x - renderable.prevX) * clamped,
    y: renderable.prevY + (transform.y - renderable.prevY) * clamped,
  };
}
