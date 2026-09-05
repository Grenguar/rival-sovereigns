/**
 * Who a goal is about.
 *
 * Shared by scoring and by binding, deliberately. An earlier version resolved the
 * target only *after* a goal was selected, while HuntMonster's considerations read
 * that same target — so the goal could never score, could never be selected, and no
 * hero ever hunted anything. One source of truth removes the circularity.
 *
 * Lives apart from goals.ts and agent-system.ts because both import it.
 */

import { NULL_HANDLE, type Agent, type Entity, type Handle, type WorldView } from '../types';

/** Nearest entity matching a predicate, hostile to us, ties broken by id. */
export function nearestOf(
  a: Agent,
  w: WorldView,
  match: (e: Entity) => boolean,
): Handle {
  const self = w.get(a.entity);
  if (self === null) return NULL_HANDLE;

  let best: Entity | null = null;
  let bestD2 = Number.POSITIVE_INFINITY;
  for (const e of w.entitiesInIdOrder()) {
    if (!e.alive || e.id === self.id || e.faction === self.faction) continue;
    if (!match(e)) continue;
    const dx = e.transform.x - self.transform.x;
    const dy = e.transform.y - self.transform.y;
    const d2 = dx * dx + dy * dy;
    if (d2 < bestD2 || (d2 === bestD2 && best !== null && e.id < best.id)) {
      best = e;
      bestD2 = d2;
    }
  }
  return best === null ? NULL_HANDLE : best.handle;
}

/**
 * Nearest lair this agent has personally seen.
 *
 * Only knownLairs, never the world's lair list — heroes are not omniscient, and an
 * unexplored corner is supposed to be able to incubate a lair for ten minutes
 * (docs/01-game-design.md §9).
 */
export function nearestKnownLair(a: Agent, w: WorldView): Handle {
  const self = w.get(a.entity);
  if (self === null || a.blackboard.knownLairs.size === 0) return NULL_HANDLE;

  let best: Entity | null = null;
  let bestD2 = Number.POSITIVE_INFINITY;
  for (const e of w.entitiesInIdOrder()) {
    if (!e.alive || e.lair === undefined || !a.blackboard.knownLairs.has(e.id)) continue;
    const dx = e.transform.x - self.transform.x;
    const dy = e.transform.y - self.transform.y;
    const d2 = dx * dx + dy * dy;
    if (d2 < bestD2 || (d2 === bestD2 && best !== null && e.id < best.id)) {
      best = e;
      bestD2 = d2;
    }
  }
  return best === null ? NULL_HANDLE : best.handle;
}

/** A visible monster first, then a lair the hero knows about. */
export function huntTarget(a: Agent, w: WorldView): Handle {
  if (w.isAlive(a.blackboard.nearestThreat)) return a.blackboard.nearestThreat;
  const visible = a.blackboard.visibleEnemies.find((h) => w.isAlive(h));
  if (visible !== undefined) return visible;
  return nearestKnownLair(a, w);
}

/** Whoever is hitting the building, falling back to anything hostile nearby. */
export function defendTarget(a: Agent, w: WorldView): Handle {
  const building = w.get(a.blackboard.damagedBuilding);
  const attacker = building?.combat?.lastDamageFrom ?? NULL_HANDLE;
  if (w.isAlive(attacker)) return attacker;
  return a.blackboard.visibleEnemies.find((h) => w.isAlive(h)) ?? NULL_HANDLE;
}

export const structureTarget = (a: Agent, w: WorldView): Handle =>
  nearestOf(a, w, (e) => e.building !== undefined);

/** Goblins prefer the economy, but will hit a structure when no henchman is near. */
export function henchmanTarget(a: Agent, w: WorldView): Handle {
  const henchman = nearestOf(a, w, (e) => e.fsm !== undefined);
  return henchman.index >= 0 ? henchman : structureTarget(a, w);
}

/** Distance to a handle, normalised against a horizon, squared throughout. */
export function normalisedDistanceTo(a: Agent, w: WorldView, h: Handle, horizon: number): number {
  const self = w.get(a.entity);
  const target = w.get(h);
  if (self === null || target === null) return 1;
  const dx = self.transform.x - target.transform.x;
  const dy = self.transform.y - target.transform.y;
  const d2 = dx * dx + dy * dy;
  const h2 = horizon * horizon;
  const v = h2 <= 0 ? 1 : d2 / h2;
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
