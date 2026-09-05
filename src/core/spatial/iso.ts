import type { EntityId, TileCoord } from '../types';

export const TILE_W = 64;
export const TILE_H = 32;
export const TILE_W_HALF = TILE_W / 2;
export const TILE_H_HALF = TILE_H / 2;

export interface ScreenCoord {
  sx: number;
  sy: number;
}

export interface Direction {
  readonly dx: number;
  readonly dy: number;
}

/** N, NE, E, SE, S, SW, W, NW. Facing indices are simulation-stable. */
export const DIR8: readonly Direction[] = [
  { dx: 0, dy: -1 },
  { dx: 1, dy: -1 },
  { dx: 1, dy: 0 },
  { dx: 1, dy: 1 },
  { dx: 0, dy: 1 },
  { dx: -1, dy: 1 },
  { dx: -1, dy: 0 },
  { dx: -1, dy: -1 },
];

export interface DepthSortable {
  readonly x: number;
  readonly y: number;
  readonly id: EntityId;
}

export function worldToScreen(x: number, y: number): ScreenCoord {
  return { sx: (x - y) * TILE_W_HALF, sy: (x + y) * TILE_H_HALF };
}

export function screenToWorld(sx: number, sy: number): { x: number; y: number } {
  return {
    x: (sx / TILE_W_HALF + sy / TILE_H_HALF) / 2,
    y: (sy / TILE_H_HALF - sx / TILE_W_HALF) / 2,
  };
}

export function tileToScreen(tile: TileCoord): ScreenCoord {
  return worldToScreen(tile.tx, tile.ty);
}

/** Returns the canonical facing for a non-zero displacement without trigonometry. */
export function facingFromDelta(dx: number, dy: number): number {
  const x = Math.sign(dx);
  const y = Math.sign(dy);
  for (let i = 0; i < DIR8.length; i++) {
    const direction = DIR8[i] as Direction;
    if (direction.dx === x && direction.dy === y) return i;
  }
  return 0;
}

/** Stable painter order. Equal depth must never delegate to engine sort behaviour. */
export function compareDepth(a: DepthSortable, b: DepthSortable): number {
  const depth = a.x + a.y - (b.x + b.y);
  return depth !== 0 ? depth : a.id - b.id;
}
