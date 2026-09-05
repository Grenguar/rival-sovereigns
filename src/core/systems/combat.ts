/**
 * A2 — attack intervals, armour and death. Tick phase 8.
 *
 * Combat never chooses a target. Action runtimes write `combat.target`; this resolves
 * swings against whatever is there. Keeping selection out of here is what lets the
 * Hero Inspector explain every fight in terms of a goal.
 */

import type { World } from '../world';
import type { Entity, EntityId } from '../types';
import { NULL_HANDLE } from '../types';
import { ARMOUR_TIERS, MIN_DAMAGE, PROGRESSION, WEAPON_TIERS, MAX_LEVEL } from '../../content/balance';
import { MONSTERS } from '../../content/monsters';

/** Base damage scaled by weapon tier and level. */
export function effectiveDamage(e: Entity): number {
  if (e.combat === undefined) return 0;
  const weapon = WEAPON_TIERS[e.equipment?.weaponTier ?? 0]?.damageMultiplier ?? 1;
  const level = PROGRESSION[(e.progression?.level ?? 1) - 1]?.damage ?? 1;
  return e.combat.damage * weapon * level;
}

/** Base armour plus the equipped tier's flat bonus. */
export function effectiveArmour(e: Entity): number {
  if (e.combat === undefined) return 0;
  const bonus = ARMOUR_TIERS[e.equipment?.armourTier ?? 0]?.armourBonus ?? 0;
  return e.combat.armour + bonus;
}

/** Damage taken = max(1, damage - armour) — docs/01-game-design.md §4.1. */
export function damageAfterArmour(attacker: Entity, defender: Entity): number {
  const raw = effectiveDamage(attacker) - effectiveArmour(defender);
  return raw < MIN_DAMAGE ? MIN_DAMAGE : raw;
}

const inRange = (a: Entity, b: Entity): boolean => {
  const range = a.combat?.range ?? 1;
  const dx = a.transform.x - b.transform.x;
  const dy = a.transform.y - b.transform.y;
  return dx * dx + dy * dy <= range * range;
};

/**
 * Applies damage and handles the consequences of a kill.
 *
 * Exported because flags, lairs and the fog system all need "hurt this thing"
 * without duplicating the death bookkeeping.
 */
export function applyDamage(w: World, target: Entity, amount: number, from: Entity | null): void {
  if (target.health === undefined || !target.alive) return;

  target.health.hp -= amount;
  w.emit({ t: 'DAMAGE', target: target.id, amount, from: from?.id ?? (0 as EntityId) });

  if (target.combat !== undefined && from !== null) {
    target.combat.lastDamageFrom = from.handle;
    target.combat.lastDamageTick = w.tick;
  }
  // An agent that takes damage re-scores Survive and DefendHome immediately rather
  // than waiting up to a second for its turn — docs/04-ai-spec.md §4.
  if (target.agent !== undefined) {
    target.agent.blackboard.lastDamageFrom = from?.handle ?? target.agent.blackboard.lastDamageFrom;
    target.agent.nextGoalTick = w.tick;
  }

  if (target.health.hp > 0) return;

  target.health.hp = 0;
  w.kill(target.handle, from?.id ?? null);
  awardKill(w, target, from);
}

/** XP to the killer, and loot left on the corpse for whoever wants it. */
function awardKill(w: World, victim: Entity, killer: Entity | null): void {
  const monster = MONSTERS[monsterKindOf(victim)];
  if (monster !== undefined) {
    // Loot stays on the body rather than teleporting into a purse — a rogue has to
    // come and take it, which is the point of LootCorpse.
    victim.purse = { gold: (victim.purse?.gold ?? 0) + monster.loot };
  }

  if (killer === null || killer.progression === undefined) return;
  const xp = monster?.xp ?? 0;
  if (xp <= 0) return;

  killer.progression.xp += xp;

  let level = killer.progression.level;
  while (level < MAX_LEVEL && killer.progression.xp >= (PROGRESSION[level]?.xp ?? Infinity)) {
    level++;
  }
  if (level !== killer.progression.level) {
    killer.progression.level = level;
    // Levelling raises the ceiling and heals by the same proportion, so a level-up
    // mid-fight is a real reprieve rather than a cosmetic number.
    if (killer.health !== undefined) {
      const base = killer.health.maxHp / (PROGRESSION[killer.progression.level - 2]?.hp ?? 1);
      const scaled = base * (PROGRESSION[level - 1]?.hp ?? 1);
      const gained = scaled - killer.health.maxHp;
      killer.health.maxHp = scaled;
      killer.health.hp = Math.min(scaled, killer.health.hp + gained);
    }
    w.emit({ t: 'LEVEL_UP', entity: killer.id, level });
  }
}

function monsterKindOf(e: Entity): string {
  return e.kind === 'monster' ? (e.agent?.classId ?? '') : '';
}

/** Tick phase 8. Id order, so simultaneous kills always resolve the same way. */
export function combatSystem(w: World): void {
  for (const attacker of w.entitiesInIdOrder()) {
    const combat = attacker.combat;
    if (combat === undefined || !attacker.alive) continue;
    if (combat.damage <= 0) continue; // peasants and tax collectors do not fight

    const target = w.get(combat.target);
    if (target === null || !target.alive || target.health === undefined) {
      combat.target = NULL_HANDLE;
      continue;
    }
    if (attacker.faction === target.faction) {
      combat.target = NULL_HANDLE;
      continue;
    }
    if (!inRange(attacker, target)) continue;
    if (w.tick < combat.nextAttackTick) continue;

    combat.nextAttackTick = w.tick + combat.attackInterval;
    applyDamage(w, target, damageAfterArmour(attacker, target), attacker);
  }
}
