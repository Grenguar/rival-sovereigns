import type { TileCoord } from '../types';
import { DIR8 } from './iso';
import { PriorityQueue } from './priority-queue';
import type { Grid } from './grid';

const ORTHOGONAL_COST = 10;
const DIAGONAL_COST = 14;

interface OpenNode {
  index: number;
  cost: number;
}

export interface PathRequest {
  readonly start: TileCoord;
  readonly goal: TileCoord;
  readonly resolve: (path: TileCoord[] | null) => void;
}

/** Octile distance using integer movement costs, preserving a deterministic tie order. */
export function octileDistance(a: TileCoord, b: TileCoord): number {
  const dx = Math.abs(a.tx - b.tx);
  const dy = Math.abs(a.ty - b.ty);
  return ORTHOGONAL_COST * (dx + dy) + (DIAGONAL_COST - 2 * ORTHOGONAL_COST) * Math.min(dx, dy);
}

/**
 * Finds a route that includes both endpoints. Movement consumers should initialise
 * `pathIndex` to 1, so they don't spend a tick walking to their current tile.
 */
export function findPath(grid: Grid, start: TileCoord, goal: TileCoord): TileCoord[] | null {
  if (!grid.contains(start) || !grid.contains(goal)) return null;
  if (!grid.isWalkable(goal)) return null;

  const startIndex = grid.indexOf(start);
  const goalIndex = grid.indexOf(goal);
  if (startIndex === goalIndex) return [start];

  const count = grid.width * grid.height;
  const costs = new Int32Array(count);
  costs.fill(-1);
  const cameFrom = new Int32Array(count);
  cameFrom.fill(-1);
  const closed = new Uint8Array(count);
  const open = new PriorityQueue<OpenNode>();
  costs[startIndex] = 0;
  open.push({ index: startIndex, cost: 0 }, octileDistance(start, goal));

  while (open.size > 0) {
    const current = open.pop();
    if (current === undefined || closed[current.index] !== 0) continue;
    if (current.cost !== (costs[current.index] as number)) continue;
    if (current.index === goalIndex) return reconstructPath(grid, cameFrom, goalIndex);
    closed[current.index] = 1;
    const currentTile = grid.coordOf(current.index);

    for (const direction of DIR8) {
      const next = { tx: currentTile.tx + direction.dx, ty: currentTile.ty + direction.dy };
      if (!grid.contains(next) || !grid.isWalkable(next)) continue;
      if (direction.dx !== 0 && direction.dy !== 0 && !canCutCorner(grid, currentTile, direction.dx, direction.dy)) continue;

      const nextIndex = grid.indexOf(next);
      if (closed[nextIndex] !== 0) continue;
      const nextCost = current.cost + (direction.dx === 0 || direction.dy === 0 ? ORTHOGONAL_COST : DIAGONAL_COST);
      const knownCost = costs[nextIndex] as number;
      if (knownCost !== -1 && nextCost >= knownCost) continue;
      costs[nextIndex] = nextCost;
      cameFrom[nextIndex] = current.index;
      open.push({ index: nextIndex, cost: nextCost }, nextCost + octileDistance(next, goal));
    }
  }

  return null;
}

/** Batches expensive searches so a sudden alert cannot monopolise a simulation tick. */
export class PathRequestQueue {
  private readonly requests: PathRequest[] = [];

  get length(): number {
    return this.requests.length;
  }

  enqueue(request: PathRequest): void {
    this.requests.push(request);
  }

  process(grid: Grid, budget = 20): number {
    if (!Number.isInteger(budget) || budget < 0) throw new Error('Path request budget must be a non-negative integer.');
    const count = Math.min(budget, this.requests.length);
    for (let i = 0; i < count; i++) {
      const request = this.requests.shift();
      if (request === undefined) break;
      request.resolve(findPath(grid, request.start, request.goal));
    }
    return count;
  }
}

function canCutCorner(grid: Grid, from: TileCoord, dx: number, dy: number): boolean {
  return grid.isWalkable({ tx: from.tx + dx, ty: from.ty }) && grid.isWalkable({ tx: from.tx, ty: from.ty + dy });
}

function reconstructPath(grid: Grid, cameFrom: Int32Array, goalIndex: number): TileCoord[] {
  const reversed: TileCoord[] = [];
  let cursor = goalIndex;
  while (cursor !== -1) {
    reversed.push(grid.coordOf(cursor));
    cursor = cameFrom[cursor] as number;
  }
  reversed.reverse();
  return reversed;
}
