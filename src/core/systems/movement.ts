/**
 * A1 — path following, facing and arrival. Tick phase 7.
 *
 * Action runtimes write a destination; this resolves it. Nothing else in the game
 * moves an entity, which is what makes "why did it go there" answerable.
 */

import type { Entity, TileCoord } from '../types';
import { TICKS_PER_SECOND, type World } from '../world';

/**
 * Eight compass directions. Facing is derived by comparing dx/dy signs and
 * magnitudes — never atan2, which is implementation-defined across engines
 * (docs/03-determinism.md §4.3).
 *
 * Mirrors spatial/iso.ts, which is the documented owner of DIR8. Duplicated only
 * because Track B owns that file; collapse to one at merge.
 */
export const DIR8: readonly { x: number; y: number }[] = [
  { x: 1, y: 0 },
  { x: 1, y: 1 },
  { x: 0, y: 1 },
  { x: -1, y: 1 },
  { x: -1, y: 0 },
  { x: -1, y: -1 },
  { x: 0, y: -1 },
  { x: 1, y: -1 },
];

/** Index into DIR8 for a delta. (0,0) keeps the previous facing, so callers guard. */
export function facingFromDelta(dx: number, dy: number): number {
  // Compare against the half-octant boundary using multiplication only. tan(22.5°)
  // is ~0.4142; 0.4142 * 1000 = 414 keeps this in integer-ish arithmetic.
  const ax = dx < 0 ? -dx : dx;
  const ay = dy < 0 ? -dy : dy;

  if (ax === 0 && ay === 0) return 0;

  const diagonal = ay * 2414 > ax * 1000 && ax * 2414 > ay * 1000;

  if (diagonal) {
    if (dx > 0 && dy > 0) return 1;
    if (dx < 0 && dy > 0) return 3;
    if (dx < 0 && dy < 0) return 5;
    return 7;
  }
  if (ax >= ay) return dx > 0 ? 0 : 4;
  return dy > 0 ? 2 : 6;
}

/**
 * Pathfinding seam. Track B owns grid A* with the 20-paths-per-tick request queue;
 * until that lands, `straightLinePath` walks directly at the destination. Swapping
 * the implementation must not change this file.
 */
export interface Pathfinder {
  /** Null means unreachable. An empty array means "already there". */
  find(from: TileCoord, to: TileCoord): TileCoord[] | null;
}

export const straightLinePathfinder: Pathfinder = {
  find(_from, to) {
    return [to];
  },
};

const EPSILON = 0.0001;

/** Moves one entity one tick toward its destination. Exported for unit testing. */
export function stepEntity(e: Entity, pathfinder: Pathfinder, topologyVersion: number): void {
  const m = e.movement;
  if (m === undefined || !e.alive) return;

  const dest = m.destination;
  if (dest === null) {
    m.path = [];
    m.pathIndex = 0;
    return;
  }

  // A path computed before a building went up may now cross it — repath lazily on
  // the next step rather than eagerly for everyone (docs/02-architecture.md §6).
  const stale = m.pathTopologyVersion !== topologyVersion;
  const needsPath = m.path.length === 0 || m.pathIndex >= m.path.length || stale;

  if (needsPath) {
    const from = { tx: Math.round(e.transform.x), ty: Math.round(e.transform.y) };
    const path = pathfinder.find(from, dest);
    if (path === null) {
      m.destination = null; // unreachable; the action will fail and the agent replans
      m.path = [];
      m.pathIndex = 0;
      return;
    }
    m.path = path;
    m.pathIndex = 0;
    m.pathTopologyVersion = topologyVersion;
  }

  const waypoint = m.path[m.pathIndex];
  if (waypoint === undefined) return;

  const dx = waypoint.tx - e.transform.x;
  const dy = waypoint.ty - e.transform.y;
  const d2 = dx * dx + dy * dy;

  const perTick = m.speed / TICKS_PER_SECOND;

  if (d2 <= perTick * perTick) {
    // Close enough to land on it exactly this tick.
    e.transform.x = waypoint.tx;
    e.transform.y = waypoint.ty;
    m.pathIndex++;
    if (m.pathIndex >= m.path.length) {
      m.path = [];
      m.pathIndex = 0;
      m.destination = null; // arrived
    }
    return;
  }

  // sqrt is correctly rounded and identical on every engine — §3.
  const d = Math.sqrt(d2);
  if (d < EPSILON) return;

  e.transform.x += (dx / d) * perTick;
  e.transform.y += (dy / d) * perTick;
  e.transform.facing = facingFromDelta(dx, dy);
}

/** Tick phase 7. Iterates in id order so movement resolution is stable. */
export function movementSystem(w: World, pathfinder: Pathfinder = straightLinePathfinder): void {
  for (const e of w.entitiesInIdOrder()) {
    if (e.movement === undefined) continue;
    stepEntity(e, pathfinder, w.topologyVersion);
  }
}

export const createMovementSystem =
  (pathfinder: Pathfinder = straightLinePathfinder) =>
  (w: World): void =>
    movementSystem(w, pathfinder);
