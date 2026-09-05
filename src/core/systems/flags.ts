/**
 * A15/A16 — reward flags. Tick phase 11.
 *
 * Gold is escrowed the moment a flag is placed and refunded in full on cancellation,
 * so the treasury number the player sees is always money they can actually spend.
 * Escrow must never leak — that is the one invariant this file exists to protect.
 */

import { FLAG_CLAIM_CAP } from '../../content/balance';
import type { Entity, EntityId } from '../types';
import type { World } from '../world';
import { noteFlag, forgetFlag } from '../ai/sensors';

/** Places a flag, moving gold from treasury into escrow. Null if unaffordable. */
export function placeFlag(w: World, e: Entity): boolean {
  const flag = e.flag;
  if (flag === undefined) return false;
  if (w.treasury < flag.gold) return false;

  w.treasury -= flag.gold;
  w.escrow += flag.gold;

  // Flag awareness is event-driven rather than periodic — docs §5.
  for (const agent of w.views.agents) {
    if (agent.faction !== 'crown' || agent.agent === undefined) continue;
    noteFlag(agent.agent, e);
  }
  return true;
}

/** Cancels a flag and refunds the escrow in full. */
export function cancelFlag(w: World, id: EntityId): void {
  for (const e of w.views.flags) {
    if (e.id !== id || e.flag === undefined || e.flag.resolved) continue;
    w.escrow -= e.flag.gold;
    w.treasury += e.flag.gold;
    e.flag.resolved = true;
    w.kill(e.handle);
    for (const agent of w.views.agents) {
      if (agent.agent !== undefined) forgetFlag(agent.agent, id);
    }
    return;
  }
}

/** Pays a claim out of escrow. Whoever lands the killing blow takes it. */
function payClaim(w: World, flagEntity: Entity, claimant: Entity): void {
  const flag = flagEntity.flag;
  if (flag === undefined || flag.resolved) return;

  flag.resolved = true;
  w.escrow -= flag.gold;
  if (claimant.purse !== undefined) claimant.purse.gold += flag.gold;

  w.emit({ t: 'FLAG_CLAIMED', flag: flagEntity.id, by: claimant.id, gold: flag.gold });
  w.kill(flagEntity.handle);
  for (const agent of w.views.agents) {
    if (agent.agent !== undefined) forgetFlag(agent.agent, flagEntity.id);
  }
}

export const flagSystem = (w: World): void => {
  for (const e of w.views.flags) {
    const flag = e.flag;
    if (flag === undefined || flag.resolved || !e.alive) continue;

    // Claim cap: without it, one large bounty pulls the entire kingdom into a corner.
    if (flag.claimants.length > FLAG_CLAIM_CAP) {
      flag.claimants = flag.claimants.slice(0, FLAG_CLAIM_CAP);
    }

    if (flag.kind === 'attack') {
      const target = w.get(flag.target);
      if (target === null) continue;
      if (target.alive) continue;
      // Whoever landed the killing blow.
      const killer = w.get(target.combat?.lastDamageFrom ?? { index: -1, generation: -1 });
      if (killer !== null && killer.purse !== undefined) payClaim(w, e, killer);
      continue;
    }

    // Explore: first hero to stand on the tile claims it.
    for (const agent of w.views.agents) {
      if (agent.kind !== 'hero') continue;
      const dx = agent.transform.x - flag.tile.tx;
      const dy = agent.transform.y - flag.tile.ty;
      if (dx * dx + dy * dy <= 1) {
        payClaim(w, e, agent);
        break;
      }
    }
  }
};

/** Registers a hero's interest, respecting the 3-hero cap. */
export function tryClaim(flagEntity: Entity, heroId: EntityId): boolean {
  const flag = flagEntity.flag;
  if (flag === undefined || flag.resolved) return false;
  if (flag.claimants.includes(heroId)) return true;
  if (flag.claimants.length >= FLAG_CLAIM_CAP) return false;
  flag.claimants.push(heroId);
  flag.claimants.sort((a, b) => a - b);
  return true;
}
