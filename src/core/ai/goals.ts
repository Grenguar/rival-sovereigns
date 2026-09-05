/**
 * A9 — the goal set. docs/04-ai-spec.md §4 and §9.
 *
 * Every goal is a target planning state plus at most five considerations. Tuning
 * happens in the order given in §11 — inputs first, then curve family, then traits,
 * then class multipliers — because going out of order produces whack-a-mole.
 *
 * Monsters share this file deliberately. Same stack, different weights.
 */

import { S, type Agent, type Entity, type GoalDef, type WorldView } from '../types';
import {
  INVERSE,
  INVERSE_STEEP,
  LINEAR,
  SATURATING,
} from './curves.gen';
import { requireAll, requireNone, merge } from './goap/state';
import { normalisedDistanceSq, norm01, ratio } from './utility';
import { CLASSES } from '../../content/classes';
import { MONSTERS } from '../../content/monsters';
import { effectiveLoyalty, POTION_COST } from '../../content/balance';

/** Horizon past which distance stops mattering, in tiles. */
const DISTANCE_HORIZON = 40;
const DEFEND_HORIZON = 20;

function self(a: Agent, w: WorldView): Entity | null {
  return w.get(a.entity);
}

function hpRatio(a: Agent, w: WorldView): number {
  const h = self(a, w)?.health;
  if (h === undefined || h.maxHp <= 0) return 1;
  return norm01(h.hp / h.maxHp);
}

/**
 * Damage per swing times durability. A crude number, but it is the same crude number
 * on both sides of every comparison, which is what matters for a ratio.
 */
function combatPower(e: Entity | null): number {
  if (e === null || e.combat === undefined) return 0;
  const hp = e.health?.hp ?? 1;
  const interval = e.combat.attackInterval > 0 ? e.combat.attackInterval : 1;
  return (e.combat.damage / interval) * hp;
}

/** 0 = no threat, 1 = hopelessly outmatched. */
function dangerRatio(a: Agent, w: WorldView): number {
  const mine = combatPower(self(a, w));
  const theirs = combatPower(w.get(a.blackboard.nearestThreat));
  if (theirs <= 0) return 0;
  if (mine <= 0) return 1;
  return norm01(theirs / (mine + theirs));
}

/** 1 = I comfortably outmatch it, 0 = it outmatches me. Survive scores on this. */
function ownPowerRatio(a: Agent, w: WorldView): number {
  return 1 - dangerRatio(a, w);
}

function distanceToHandleSq(a: Agent, w: WorldView, horizon: number): number {
  const me = self(a, w);
  const target = w.get(a.blackboard.currentTarget);
  if (me === null || target === null) return 1;
  return normalisedDistanceSq(
    me.transform.x - target.transform.x,
    me.transform.y - target.transform.y,
    horizon,
  );
}

/** The bounty currently worth most to this agent, or null. */
export function bestKnownFlag(a: Agent): { gold: number; tx: number; ty: number } | null {
  let best: { gold: number; tx: number; ty: number } | null = null;
  // Sorted by id in the sensor, so ties here resolve stably.
  for (const f of a.blackboard.knownFlags) {
    if (best === null || f.gold > best.gold) best = { gold: f.gold, tx: f.tile.tx, ty: f.tile.ty };
  }
  return best;
}

/** Goal weights for one kind, from content. Absent means unavailable. */
function multipliers(): Record<string, Record<string, number>> {
  const out: Record<string, Record<string, number>> = {};
  for (const c of Object.values(CLASSES)) out[c.id] = c.goalMultipliers;
  for (const m of Object.values(MONSTERS)) out[m.id] = m.goalMultipliers;
  return out;
}

const M = multipliers();

/** Reads a goal's multiplier per kind, defaulting heroes to 1.0 and monsters to 0. */
function weights(goal: string, heroDefault = 1.0): Record<string, number> {
  const out: Record<string, number> = {};
  for (const kind of Object.keys(M)) {
    const isHero = CLASSES[kind] !== undefined;
    const explicit = M[kind]?.[goal];
    out[kind] = explicit ?? (isHero ? heroDefault : 0);
  }
  return out;
}

// ── Hero goals ──────────────────────────────────────────────────────────────

const Survive: GoalDef = {
  id: 'Survive',
  target: merge(requireAll(S.SAFE), requireNone(S.IS_CRITICAL)),
  interruptible: true, // a hero that takes a second to notice it is dying looks broken
  classMultiplier: weights('Survive'),
  considerations: [
    {
      id: 'hp',
      // Falls steeply: 25% HP must feel very different from 50%.
      family: INVERSE_STEEP,
      input: hpRatio,
    },
    {
      id: 'relativePower',
      family: INVERSE,
      trait: 'courage',
      traitInverted: true, // courage must *lower* the urge to run
      input: ownPowerRatio,
    },
  ],
};

const Heal: GoalDef = {
  id: 'Heal',
  target: requireNone(S.IS_INJURED),
  interruptible: false,
  classMultiplier: weights('Heal'),
  considerations: [
    { id: 'hp', family: INVERSE, input: hpRatio },
    {
      id: 'affordability',
      family: SATURATING,
      input: (a, w) => ratio(self(a, w)?.purse?.gold ?? 0, POTION_COST),
    },
    {
      id: 'distanceToCare',
      family: INVERSE,
      input: (a, w) => {
        const me = self(a, w);
        const inn = w.get(a.blackboard.nearestShop.inn);
        const guild = w.get(a.blackboard.homeGuild);
        const dest = inn ?? guild;
        if (me === null || dest === null) return 1;
        return normalisedDistanceSq(
          me.transform.x - dest.transform.x,
          me.transform.y - dest.transform.y,
          DISTANCE_HORIZON,
        );
      },
    },
  ],
};

const ClaimBounty: GoalDef = {
  id: 'ClaimBounty',
  target: requireAll(S.HAS_GOLD, S.BOUNTY_KNOWN),
  interruptible: false,
  classMultiplier: weights('ClaimBounty'),
  considerations: [
    {
      id: 'worth',
      // Against gold already held: 300 means far more to a hero with 20 than to one
      // with 900. The +100 keeps a broke hero from treating any bounty as infinite.
      family: SATURATING,
      trait: 'greed',
      input: (a, w) => {
        const flag = bestKnownFlag(a);
        if (flag === null) return 0;
        const gold = self(a, w)?.purse?.gold ?? 0;
        return norm01(flag.gold / (gold + 100));
      },
    },
    {
      id: 'distance',
      family: INVERSE,
      input: (a, w) => {
        const me = self(a, w);
        const flag = bestKnownFlag(a);
        if (me === null || flag === null) return 1;
        return normalisedDistanceSq(
          me.transform.x - flag.tx,
          me.transform.y - flag.ty,
          DISTANCE_HORIZON,
        );
      },
    },
    { id: 'danger', family: INVERSE, trait: 'courage', input: dangerRatio },
  ],
};

const HuntMonster: GoalDef = {
  id: 'HuntMonster',
  target: requireAll(S.TARGET_DEAD),
  interruptible: false,
  classMultiplier: weights('HuntMonster'),
  considerations: [
    { id: 'danger', family: INVERSE, trait: 'courage', input: dangerRatio },
    { id: 'distance', family: INVERSE, input: (a, w) => distanceToHandleSq(a, w, DISTANCE_HORIZON) },
    {
      id: 'hasTarget',
      family: LINEAR,
      input: (a, w) => (w.isAlive(a.blackboard.currentTarget) ? 1 : 0),
    },
  ],
};

const DefendHome: GoalDef = {
  id: 'DefendHome',
  target: requireAll(S.TARGET_DEAD),
  interruptible: true,
  classMultiplier: weights('DefendHome'),
  considerations: [
    {
      id: 'buildingDamage',
      family: LINEAR,
      trait: 'loyalty',
      // Effective loyalty, not raw: at 50% tax it is down 60% and heroes stop
      // defending your buildings. That is the whole point of the tax slider.
      input: (a, w) => {
        const b = w.get(a.blackboard.damagedBuilding);
        if (b?.health === undefined || b.health.maxHp <= 0) return 0;
        const damaged = 1 - b.health.hp / b.health.maxHp;
        const loyalty = effectiveLoyalty(a.traits.loyalty, w.taxRate);
        return norm01(damaged * (loyalty / (a.traits.loyalty > 0 ? a.traits.loyalty : 1)));
      },
    },
    {
      id: 'distance',
      family: INVERSE_STEEP,
      input: (a, w) => {
        const me = self(a, w);
        const b = w.get(a.blackboard.damagedBuilding);
        if (me === null || b === null) return 1;
        return normalisedDistanceSq(
          me.transform.x - b.transform.x,
          me.transform.y - b.transform.y,
          DEFEND_HORIZON,
        );
      },
    },
  ],
};

const Upgrade: GoalDef = {
  id: 'Upgrade',
  target: requireNone(S.UPGRADE_AVAILABLE),
  interruptible: false,
  classMultiplier: weights('Upgrade'),
  considerations: [
    {
      id: 'affordability',
      family: SATURATING,
      input: (a, w) => ratio(self(a, w)?.purse?.gold ?? 0, 400),
    },
    {
      id: 'gearTier',
      // Falls as gear improves — a fully kitted hero stops caring.
      family: INVERSE,
      input: (a, w) => {
        const eq = self(a, w)?.equipment;
        if (eq === undefined) return 0;
        return norm01((eq.weaponTier + eq.armourTier) / 4);
      },
    },
  ],
};

const Explore: GoalDef = {
  id: 'Explore',
  target: requireAll(S.TARGET_KNOWN),
  interruptible: false,
  classMultiplier: weights('Explore'),
  considerations: [
    {
      id: 'frontierDistance',
      family: INVERSE,
      trait: 'curiosity',
      input: (a, w) => {
        const me = self(a, w);
        const frontier = a.blackboard.frontierTile;
        if (me === null || frontier === null) return 1;
        return normalisedDistanceSq(
          me.transform.x - frontier.tx,
          me.transform.y - frontier.ty,
          DISTANCE_HORIZON,
        );
      },
    },
    { id: 'localThreat', family: INVERSE, input: dangerRatio },
  ],
};

/** The floor. Always available, always low — docs/04-ai-spec.md §4. */
const Idle: GoalDef = {
  id: 'Idle',
  target: requireAll(S.SAFE),
  interruptible: false,
  classMultiplier: weights('Idle', 1.0),
  considerations: [{ id: 'floor', family: LINEAR, input: () => 0.05 }],
};

// ── Monster goals — docs/04-ai-spec.md §9 ───────────────────────────────────

const AttackStructure: GoalDef = {
  id: 'AttackStructure',
  target: requireAll(S.TARGET_DEAD),
  interruptible: false,
  classMultiplier: weights('AttackStructure', 0),
  considerations: [
    { id: 'distance', family: INVERSE, input: (a, w) => distanceToHandleSq(a, w, DISTANCE_HORIZON) },
    {
      id: 'hasTarget',
      family: LINEAR,
      input: (a, w) => (w.isAlive(a.blackboard.currentTarget) ? 1 : 0),
    },
  ],
};

/**
 * Goblins only. The design's sharpest tooth: it attacks the economy rather than the
 * army, and the player has no direct way to protect henchmen.
 */
const AttackHenchman: GoalDef = {
  id: 'AttackHenchman',
  target: requireAll(S.TARGET_DEAD),
  interruptible: false,
  classMultiplier: weights('AttackHenchman', 0),
  considerations: [
    { id: 'distance', family: INVERSE, input: (a, w) => distanceToHandleSq(a, w, DISTANCE_HORIZON) },
    {
      id: 'henchmanVisible',
      family: LINEAR,
      input: (a, w) => {
        for (const h of a.blackboard.visibleEnemies) {
          if (w.get(h)?.fsm !== undefined) return 1;
        }
        return 0;
      },
    },
  ],
};

export const HERO_GOALS: readonly GoalDef[] = [
  Survive,
  Heal,
  ClaimBounty,
  HuntMonster,
  DefendHome,
  Upgrade,
  Explore,
  Idle,
];

export const MONSTER_GOALS: readonly GoalDef[] = [AttackStructure, AttackHenchman, Survive, Idle];

export const ALL_GOALS: readonly GoalDef[] = [...HERO_GOALS, AttackStructure, AttackHenchman];

/** Which goal set an agent scores, by kind. */
export function goalsFor(classId: string): readonly GoalDef[] {
  return CLASSES[classId] !== undefined ? HERO_GOALS : MONSTER_GOALS;
}

/** Goals that re-score immediately on damage rather than waiting their turn. */
export const INTERRUPT_GOALS = ALL_GOALS.filter((g) => g.interruptible);
