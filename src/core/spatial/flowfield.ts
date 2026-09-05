import type { TileCoord } from '../types';
import { DIR8 } from './iso';
import { PriorityQueue } from './priority-queue';
import type { Grid } from './grid';

const ORTHOGONAL_COST = 10;
const DIAGONAL_COST = 14;
const UNREACHABLE = -1;

interface FieldNode {
  index: number;
  cost: number;
}

/**
 * A reverse Dijkstra field. `nextStep` gives each agent its first move toward one
 * shared destination, eliminating identical A* searches for guilds and shops.
 */
export class FlowField {
  readonly destination: TileCoord;
  readonly topologyVersion: number;
  private readonly costs: Int32Array;
  private readonly next: Int32Array;
  private readonly grid: Grid;

  private constructor(grid: Grid, destination: TileCoord, costs: Int32Array, next: Int32Array) {
    this.grid = grid;
    this.destination = destination;
    this.topologyVersion = grid.topologyVersion;
    this.costs = costs;
    this.next = next;
  }

  static build(grid: Grid, destination: TileCoord): FlowField {
    const count = grid.width * grid.height;
    const costs = new Int32Array(count);
    const next = new Int32Array(count);
    costs.fill(UNREACHABLE);
    next.fill(UNREACHABLE);
    if (!grid.contains(destination) || !grid.isWalkable(destination)) {
      return new FlowField(grid, destination, costs, next);
    }

    const destinationIndex = grid.indexOf(destination);
    const open = new PriorityQueue<FieldNode>();
    costs[destinationIndex] = 0;
    open.push({ index: destinationIndex, cost: 0 }, 0);

    while (open.size > 0) {
      const current = open.pop();
      if (current === undefined || current.cost !== (costs[current.index] as number)) continue;
      const tile = grid.coordOf(current.index);

      for (const direction of DIR8) {
        const neighbor = { tx: tile.tx + direction.dx, ty: tile.ty + direction.dy };
        if (!grid.contains(neighbor) || !grid.isWalkable(neighbor)) continue;
        if (direction.dx !== 0 && direction.dy !== 0 && !canCutCorner(grid, tile, direction.dx, direction.dy)) continue;
        const neighborIndex = grid.indexOf(neighbor);
        const nextCost = current.cost + (direction.dx === 0 || direction.dy === 0 ? ORTHOGONAL_COST : DIAGONAL_COST);
        const knownCost = costs[neighborIndex] as number;
        if (knownCost !== UNREACHABLE && nextCost >= knownCost) continue;
        costs[neighborIndex] = nextCost;
        next[neighborIndex] = current.index;
        open.push({ index: neighborIndex, cost: nextCost }, nextCost);
      }
    }

    return new FlowField(grid, destination, costs, next);
  }

  isCurrent(): boolean {
    return this.grid.topologyVersion === this.topologyVersion;
  }

  costAt(tile: TileCoord): number | null {
    if (!this.grid.contains(tile)) return null;
    const cost = this.costs[this.grid.indexOf(tile)] as number;
    return cost === UNREACHABLE ? null : cost;
  }

  nextStep(tile: TileCoord): TileCoord | null {
    if (!this.grid.contains(tile)) return null;
    const nextIndex = this.next[this.grid.indexOf(tile)] as number;
    return nextIndex === UNREACHABLE ? null : this.grid.coordOf(nextIndex);
  }
}

/** Keeps one field per destination and rebuilds only after topology mutation. */
export class FlowFieldCache {
  private readonly fields = new Map<string, FlowField>();

  get(grid: Grid, destination: TileCoord): FlowField {
    const key = `${destination.tx},${destination.ty}`;
    const cached = this.fields.get(key);
    if (cached !== undefined && cached.isCurrent()) return cached;
    const field = FlowField.build(grid, destination);
    this.fields.set(key, field);
    return field;
  }

  clear(): void {
    this.fields.clear();
  }
}

function canCutCorner(grid: Grid, from: TileCoord, dx: number, dy: number): boolean {
  return grid.isWalkable({ tx: from.tx + dx, ty: from.ty }) && grid.isWalkable({ tx: from.tx, ty: from.ty + dy });
}
