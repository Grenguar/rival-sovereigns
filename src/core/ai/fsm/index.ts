/**
 * A10 — henchman finite state machines. Tick phase 6.
 *
 * Peasants, tax collectors and guards have no self-interest and no choices worth
 * searching over. Planning would spend CPU producing behaviour a thirty-line FSM
 * produces identically — docs/04-ai-spec.md §8. Giving them GOAP "for consistency"
 * is listed in AGENTS.md §6 as a thing that looks like an improvement and is not.
 *
 * They are numbered, not named. The contrast with heroes is free characterisation.
 */

import { NULL_HANDLE, type Entity, type TileCoord } from '../../types';
import type { World } from '../../world';
import { GUARD_LEASH_RADIUS } from '../../../content/monsters';
import { HERO_BANK_THRESHOLD } from '../../../content/balance';

const distSq = (a: Entity, b: { x: number; y: number }): number => {
  const dx = a.transform.x - b.x;
  const dy = a.transform.y - b.y;
  return dx * dx + dy * dy;
};

const AT = 1.5 * 1.5;

function goTo(e: Entity, tile: TileCoord | null): void {
  if (e.movement === undefined) return;
  e.movement.destination = tile;
}

const tileOf = (e: Entity): TileCoord => ({
  tx: Math.round(e.transform.x),
  ty: Math.round(e.transform.y),
});

/** Nearest matching building of our own faction, ties by id. */
function nearestBuilding(w: World, from: Entity, match: (e: Entity) => boolean): Entity | null {
  let best: Entity | null = null;
  let bestD2 = Number.POSITIVE_INFINITY;
  for (const e of w.entitiesInIdOrder()) {
    if (e.building === undefined || e.faction !== from.faction || !e.alive) continue;
    if (!match(e)) continue;
    const d2 = distSq(e, from.transform);
    if (d2 < bestD2 || (d2 === bestD2 && best !== null && e.id < best.id)) {
      best = e;
      bestD2 = d2;
    }
  }
  return best;
}

// ── Peasant: Idle → WalkToSite → Build → Repair → Idle ──────────────────────

/** Peasants build at 12 HP of structure per second — docs/01-game-design.md §6. */
export const PEASANT_BUILD_PER_TICK = 1.2;

export function peasantFsm(w: World, e: Entity): void {
  const fsm = e.fsm;
  if (fsm === undefined) return;

  switch (fsm.state) {
    case 'Idle': {
      const site = nearestBuilding(
        w,
        e,
        (b) => b.building?.state === 'underConstruction' || b.building?.state === 'damaged',
      );
      if (site === null) return;
      fsm.targetSite = site.handle;
      fsm.state = 'WalkToSite';
      goTo(e, tileOf(site));
      return;
    }
    case 'WalkToSite': {
      const site = w.get(fsm.targetSite);
      if (site === null || !site.alive || site.building === undefined) {
        fsm.state = 'Idle';
        fsm.targetSite = NULL_HANDLE;
        return;
      }
      if (distSq(e, site.transform) <= AT) {
        fsm.state = site.building.state === 'damaged' ? 'Repair' : 'Build';
        goTo(e, null);
      }
      return;
    }
    case 'Build':
    case 'Repair': {
      const site = w.get(fsm.targetSite);
      if (site?.building === undefined || site.health === undefined || !site.alive) {
        fsm.state = 'Idle';
        fsm.targetSite = NULL_HANDLE;
        return;
      }
      site.health.hp = Math.min(site.health.maxHp, site.health.hp + PEASANT_BUILD_PER_TICK);

      if (site.building.state === 'underConstruction') {
        site.building.progress = site.health.hp / site.health.maxHp;
        if (site.building.progress >= 1) {
          site.building.state = 'complete';
          site.building.progress = 1;
          w.emit({ t: 'BUILD_COMPLETE', entity: site.id });
          // A new building changes the walkable topology.
          w.topologyVersion++;
          fsm.state = 'Idle';
        }
      } else if (site.health.hp >= site.health.maxHp) {
        site.building.state = 'complete';
        fsm.state = 'Idle';
      }
      return;
    }
    default:
      fsm.state = 'Idle';
  }
}

// ── Tax collector: Idle → WalkToGuild → Collect → WalkToPalace → Deposit ────

export function taxCollectorFsm(w: World, e: Entity): void {
  const fsm = e.fsm;
  if (fsm === undefined) return;

  switch (fsm.state) {
    case 'Idle': {
      const guild = nearestBuilding(
        w,
        e,
        (b) => (b.building?.vault ?? 0) > 0 && b.building?.state !== 'underConstruction',
      );
      if (guild === null) return;
      fsm.targetSite = guild.handle;
      fsm.state = 'WalkToGuild';
      goTo(e, tileOf(guild));
      return;
    }
    case 'WalkToGuild': {
      const guild = w.get(fsm.targetSite);
      if (guild === null || !guild.alive) {
        fsm.state = 'Idle';
        return;
      }
      if (distSq(e, guild.transform) <= AT) fsm.state = 'Collect';
      return;
    }
    case 'Collect': {
      const guild = w.get(fsm.targetSite);
      if (guild?.building === undefined) {
        fsm.state = 'Idle';
        return;
      }
      // The collector takes the player's cut of the vault, not the whole vault.
      const take = Math.floor(guild.building.vault * w.taxRate);
      guild.building.vault -= take;
      fsm.carrying += take;
      fsm.state = 'WalkToPalace';

      const palace = nearestBuilding(w, e, (b) => b.building?.kind === 'palace');
      goTo(e, palace === null ? null : tileOf(palace));
      return;
    }
    case 'WalkToPalace': {
      const palace = nearestBuilding(w, e, (b) => b.building?.kind === 'palace');
      if (palace === null) {
        fsm.state = 'Idle';
        return;
      }
      goTo(e, tileOf(palace));
      if (distSq(e, palace.transform) <= AT) fsm.state = 'Deposit';
      return;
    }
    case 'Deposit': {
      w.treasury += fsm.carrying;
      w.taxCollected += fsm.carrying;
      if (fsm.carrying > 0) {
        w.emit({ t: 'GOLD', entity: e.id, delta: fsm.carrying, reason: 'tax' });
      }
      fsm.carrying = 0;
      fsm.state = 'Idle';
      return;
    }
    default:
      fsm.state = 'Idle';
  }
}

/**
 * Carried gold hits the ground on death rather than vanishing.
 *
 * Deliberate: losing a loaded collector to a wandering goblin is a real event, and
 * watching a rogue pocket your tax revenue is exactly the sort of story this game
 * should generate — docs/01-game-design.md §3.1.
 */
export function dropCarriedGold(e: Entity): void {
  const carrying = e.fsm?.carrying ?? 0;
  if (carrying <= 0) return;
  e.purse = { gold: (e.purse?.gold ?? 0) + carrying };
  if (e.fsm !== undefined) e.fsm.carrying = 0;
}

// ── Guard: Patrol → Engage → ReturnToPost ───────────────────────────────────

export function guardFsm(w: World, e: Entity): void {
  const fsm = e.fsm;
  if (fsm === undefined || e.combat === undefined) return;
  const post = fsm.post;
  if (post === null) return;

  const beyondLeash = (target: Entity): boolean =>
    distSq(target, { x: post.tx, y: post.ty }) > GUARD_LEASH_RADIUS * GUARD_LEASH_RADIUS;

  switch (fsm.state) {
    case 'Patrol': {
      let quarry: Entity | null = null;
      for (const other of w.entitiesInIdOrder()) {
        if (!other.alive || other.faction === e.faction || other.faction === 'neutral') continue;
        if (other.combat === undefined) continue;
        if (beyondLeash(other)) continue;
        quarry = other;
        break; // id order makes "first" deterministic
      }
      if (quarry !== null) {
        fsm.state = 'Engage';
        fsm.targetSite = quarry.handle;
        e.combat.target = quarry.handle;
      } else if (distSq(e, { x: post.tx, y: post.ty }) > AT) {
        goTo(e, post);
      }
      return;
    }
    case 'Engage': {
      const quarry = w.get(fsm.targetSite);
      // Guards never leave radius 8 of their post, even mid-chase — §8.
      if (quarry === null || !quarry.alive || beyondLeash(quarry)) {
        fsm.state = 'ReturnToPost';
        fsm.targetSite = NULL_HANDLE;
        e.combat.target = NULL_HANDLE;
        goTo(e, post);
        return;
      }
      e.combat.target = quarry.handle;
      goTo(e, tileOf(quarry));
      return;
    }
    case 'ReturnToPost': {
      goTo(e, post);
      if (distSq(e, { x: post.tx, y: post.ty }) <= AT) fsm.state = 'Patrol';
      return;
    }
    default:
      fsm.state = 'Patrol';
  }
}

/** Tick phase 6. */
export function fsmSystem(w: World): void {
  for (const e of w.entitiesInIdOrder()) {
    if (e.fsm === undefined || !e.alive) continue;
    switch (e.fsm.kind) {
      case 'peasant':
        peasantFsm(w, e);
        break;
      case 'taxCollector':
        taxCollectorFsm(w, e);
        break;
      case 'guard':
        guardFsm(w, e);
        break;
    }
  }
}

export { HERO_BANK_THRESHOLD };
