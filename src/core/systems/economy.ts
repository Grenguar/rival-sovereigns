/**
 * A12 — purses, banking, stipend and the palace. Tick phase 9, at 1 Hz not 10.
 *
 * Gold is conserved: it is created only by the stipend and monster loot, and
 * destroyed nowhere. tests assert that, because a leak here is invisible for
 * thousands of ticks and then the economy is quietly broken.
 */

import type { World } from '../world';
import { ECONOMY_PERIOD } from '../world';
import {
  HERO_BANK_THRESHOLD,
  PALACE_STIPEND,
  PALACE_STIPEND_PERIOD_TICKS,
} from '../../content/balance';

export const economySystem = (w: World): void => {
  // The stipend prevents a hard lock — a kingdom with no income can still act.
  if (w.tick % PALACE_STIPEND_PERIOD_TICKS === 0) {
    const palace = w.views.buildings.find((b) => b.building?.kind === 'palace' && b.alive);
    if (palace !== undefined) {
      w.treasury += PALACE_STIPEND;
      w.goldCreated += PALACE_STIPEND;
    }
  }

  // Heroes bank what they are not carrying for a reason, at their home guild.
  for (const e of w.views.agents) {
    if (e.kind !== 'hero' || e.purse === undefined || e.agent === undefined) continue;
    if (e.purse.gold <= HERO_BANK_THRESHOLD) continue;

    const guild = w.get(e.agent.blackboard.homeGuild);
    if (guild?.building === undefined || !guild.alive) continue;

    const dx = e.transform.x - guild.transform.x;
    const dy = e.transform.y - guild.transform.y;
    if (dx * dx + dy * dy > 9) continue;

    const deposit = e.purse.gold - HERO_BANK_THRESHOLD;
    e.purse.gold -= deposit;
    guild.building.vault += deposit;
    w.emit({ t: 'GOLD', entity: e.id, delta: -deposit, reason: 'bank' });
  }

  void ECONOMY_PERIOD;
};

/**
 * A24 — mission end. Win when every lair is destroyed, lose when the palace falls.
 * No timer: over-fortifying just makes the mission longer.
 */
export const outcomeSystem = (w: World): void => {
  if (w.outcome !== 'playing') return;

  const palace = w.views.buildings.find((b) => b.building?.kind === 'palace');
  if (palace !== undefined && !palace.alive) {
    w.outcome = 'lost';
    return;
  }

  const lairs = w.views.lairs;
  if (lairs.length > 0 && lairs.every((l) => !l.alive)) w.outcome = 'won';
};
