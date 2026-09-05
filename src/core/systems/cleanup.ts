/**
 * A14 — death consequences. Tick phase 12, before the reaper recycles the slot.
 */

import type { World } from '../world';
import { dropCarriedGold } from '../ai/fsm';
import { NULL_HANDLE } from '../types';

export const cleanupSystem = (w: World): void => {
  for (const e of w.entitiesInIdOrder()) {
    if (e.alive) continue;

    // A tax collector drops what it was carrying where it fell — rogues will take it.
    if (e.fsm?.kind === 'taxCollector') dropCarriedGold(e);

    // Anyone targeting a corpse stops swinging at it.
    if (e.combat !== undefined) e.combat.target = NULL_HANDLE;
  }

  // Clear stale targets pointing at recycled slots.
  for (const e of w.entitiesInIdOrder()) {
    if (e.combat === undefined) continue;
    if (e.combat.target.index >= 0 && w.get(e.combat.target) === null) {
      e.combat.target = NULL_HANDLE;
    }
  }
};
