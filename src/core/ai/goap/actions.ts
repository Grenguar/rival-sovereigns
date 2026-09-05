/**
 * A6 — the sixteen MVP actions. docs/04-ai-spec.md §3.
 *
 * The GOAP payoff lives here: adding an action with preconditions and effects
 * immediately changes what every agent will consider doing, with no change to any
 * decision code. Keep that property — put behaviour in `runtime`, never a special
 * case in the planner.
 *
 * Runtimes do not path or swing themselves. They write intent — a movement
 * destination, a combat target — and the movement and combat systems resolve it
 * later in the same tick, in the fixed order of docs/02-architecture.md §2.2.
 */

import {
  S,
  type ActionDef,
  type ActionRuntime,
  type Agent,
  type Entity,
  type Handle,
  type StepResult,
  type TileCoord,
  type WorldView,
} from '../../types';
import { NULL_HANDLE } from '../../types';
import { CLASSES } from '../../../content/classes';
import {
  ARMOUR_TIERS,
  GUILD_HEAL_PER_TICK,
  INN_REST_COST,
  INN_REST_TICKS,
  MIN_DAMAGE,
  POTION_COST,
  POTION_HEAL_FRACTION,
  WEAPON_TIERS,
} from '../../../content/balance';
import { makeState, requireAll, requireNone, merge } from './state';

/** How close counts as "there". Half a tile, squared to stay in the fast path. */
export const ARRIVAL_RADIUS = 0.5;
const ARRIVAL_RADIUS_SQ = ARRIVAL_RADIUS * ARRIVAL_RADIUS;

// ── shared helpers ──────────────────────────────────────────────────────────

export function agentEntity(a: Agent, w: WorldView): Entity | null {
  return w.get(a.entity);
}

/** Gold above which this agent counts as solvent. Monsters never shop. */
export function spendThreshold(a: Agent): number {
  return CLASSES[a.classId]?.spendThreshold ?? Number.POSITIVE_INFINITY;
}

function distanceSq(from: Entity, to: { x: number; y: number }): number {
  const dx = from.transform.x - to.x;
  const dy = from.transform.y - to.y;
  return dx * dx + dy * dy;
}

/** Straight-line distance as a planning cost. sqrt is permitted and exact. */
function travelCost(a: Agent, w: WorldView, to: { x: number; y: number } | null): number {
  const self = agentEntity(a, w);
  if (self === null || to === null) return 40; // unknown: expensive but not impossible
  return Math.sqrt(distanceSq(self, to));
}

function handlePosition(w: WorldView, h: Handle): { x: number; y: number } | null {
  const e = w.get(h);
  return e === null ? null : { x: e.transform.x, y: e.transform.y };
}

function setDestination(a: Agent, w: WorldView, dest: TileCoord | null): void {
  const self = agentEntity(a, w);
  if (self?.movement === undefined) return;
  self.movement.destination = dest;
}

function arrived(a: Agent, w: WorldView, at: { x: number; y: number } | null): boolean {
  const self = agentEntity(a, w);
  if (self === null || at === null) return false;
  return distanceSq(self, at) <= ARRIVAL_RADIUS_SQ;
}

const toTile = (p: { x: number; y: number }): TileCoord => ({
  tx: Math.round(p.x),
  ty: Math.round(p.y),
});

/**
 * A movement runtime shared by all five Move* actions.
 *
 * `resolve` says where to go; everything else — writing the destination, polling for
 * arrival, clearing intent on abort — is identical, and duplicating it five times is
 * how the five slowly drift apart.
 */
function moveRuntime(resolve: (a: Agent, w: WorldView) => Handle | TileCoord | null): ActionRuntime {
  const target = (a: Agent, w: WorldView): { x: number; y: number } | null => {
    const r = resolve(a, w);
    if (r === null) return null;
    if ('tx' in r) return { x: r.tx, y: r.ty };
    return handlePosition(w, r);
  };

  return {
    start(a, w) {
      const t = target(a, w);
      setDestination(a, w, t === null ? null : toTile(t));
    },
    tick(a, w): StepResult {
      const t = target(a, w);
      if (t === null) return 'failure'; // the shop burned down, the target died
      if (arrived(a, w, t)) return 'success';
      // Re-issue: a moving target means the destination must follow it.
      setDestination(a, w, toTile(t));
      return 'running';
    },
    stillValid(a, w) {
      return target(a, w) !== null;
    },
    abort(a, w) {
      setDestination(a, w, null);
    },
  };
}

/** A runtime that resolves in one tick and cannot fail partway. */
function instantRuntime(effect: (a: Agent, w: WorldView) => boolean): ActionRuntime {
  return {
    start() {},
    tick(a, w): StepResult {
      return effect(a, w) ? 'success' : 'failure';
    },
    stillValid() {
      return true;
    },
    abort() {},
  };
}

function purseOf(a: Agent, w: WorldView) {
  return agentEntity(a, w)?.purse;
}

function healthOf(a: Agent, w: WorldView) {
  return agentEntity(a, w)?.health;
}

// ── the actions ─────────────────────────────────────────────────────────────

const MoveToTarget: ActionDef = {
  id: 'MoveToTarget',
  pre: requireAll(S.TARGET_KNOWN),
  eff: requireAll(S.AT_TARGET),
  classes: 'all',
  cost: (a, w) => travelCost(a, w, handlePosition(w, a.blackboard.currentTarget)),
  isValid: (a, w) => w.get(a.blackboard.currentTarget) !== null,
  bind: (a, w) => w.get(a.blackboard.currentTarget) !== null,
  runtime: moveRuntime((a) => a.blackboard.currentTarget),
};

const MoveToMarket: ActionDef = {
  id: 'MoveToMarket',
  pre: makeState(0, 0),
  eff: requireAll(S.AT_MARKET),
  classes: 'all',
  cost: (a, w) => travelCost(a, w, handlePosition(w, a.blackboard.nearestShop.market)),
  isValid: (a, w) => w.isAlive(a.blackboard.nearestShop.market),
  bind: (a, w) => w.isAlive(a.blackboard.nearestShop.market),
  runtime: moveRuntime((a) => a.blackboard.nearestShop.market),
};

const MoveToSmith: ActionDef = {
  id: 'MoveToSmith',
  pre: makeState(0, 0),
  eff: requireAll(S.AT_SMITH),
  classes: 'all',
  cost: (a, w) => travelCost(a, w, handlePosition(w, a.blackboard.nearestShop.smith)),
  isValid: (a, w) => w.isAlive(a.blackboard.nearestShop.smith),
  bind: (a, w) => w.isAlive(a.blackboard.nearestShop.smith),
  runtime: moveRuntime((a) => a.blackboard.nearestShop.smith),
};

const MoveToInn: ActionDef = {
  id: 'MoveToInn',
  pre: makeState(0, 0),
  eff: requireAll(S.AT_INN),
  classes: 'all',
  cost: (a, w) => travelCost(a, w, handlePosition(w, a.blackboard.nearestShop.inn)),
  isValid: (a, w) => w.isAlive(a.blackboard.nearestShop.inn),
  bind: (a, w) => w.isAlive(a.blackboard.nearestShop.inn),
  runtime: moveRuntime((a) => a.blackboard.nearestShop.inn),
};

const MoveToGuild: ActionDef = {
  id: 'MoveToGuild',
  pre: makeState(0, 0),
  eff: requireAll(S.AT_HOME_GUILD),
  classes: 'all',
  cost: (a, w) => travelCost(a, w, handlePosition(w, a.blackboard.homeGuild)),
  isValid: (a, w) => w.isAlive(a.blackboard.homeGuild),
  bind: (a, w) => w.isAlive(a.blackboard.homeGuild),
  runtime: moveRuntime((a) => a.blackboard.homeGuild),
};

/**
 * Cost is estimated rounds x danger ratio x 4 — docs/04-ai-spec.md §3.
 *
 * This is what makes a hero prefer an easy kill to a hard one *during planning*,
 * separately from whether it wants the kill at all, which is tier 1's job.
 */
const Attack: ActionDef = {
  id: 'Attack',
  pre: requireAll(S.AT_TARGET),
  eff: requireAll(S.TARGET_DEAD),
  classes: 'all',
  cost: (a, w) => {
    const self = agentEntity(a, w);
    const target = w.get(a.blackboard.currentTarget);
    if (self?.combat === undefined || target?.health === undefined) return 20;

    const outgoing = Math.max(MIN_DAMAGE, self.combat.damage - (target.combat?.armour ?? 0));
    const estRounds = target.health.hp / outgoing;

    const incoming = Math.max(MIN_DAMAGE, (target.combat?.damage ?? 0) - self.combat.armour);
    const ownHp = self.health?.hp ?? 1;
    const dangerRatio = (incoming * estRounds) / (ownHp > 0 ? ownHp : 1);

    return estRounds * dangerRatio * 4;
  },
  isValid: (a, w) => {
    const t = w.get(a.blackboard.currentTarget);
    return t !== null && t.alive;
  },
  bind: (a, w) => w.isAlive(a.blackboard.currentTarget),
  runtime: {
    start(a, w) {
      const self = agentEntity(a, w);
      if (self?.combat !== undefined) self.combat.target = a.blackboard.currentTarget;
    },
    tick(a, w): StepResult {
      const target = w.get(a.blackboard.currentTarget);
      if (target === null) return 'failure';
      if (!target.alive) return 'success';
      const self = agentEntity(a, w);
      if (self?.combat === undefined) return 'failure';
      // Combat resolution happens in its own phase; this only holds the intent.
      self.combat.target = a.blackboard.currentTarget;
      return 'running';
    },
    stillValid(a, w) {
      return w.get(a.blackboard.currentTarget) !== null;
    },
    abort(a, w) {
      const self = agentEntity(a, w);
      if (self?.combat !== undefined) self.combat.target = NULL_HANDLE;
    },
  },
};

const ClaimBounty: ActionDef = {
  id: 'ClaimBounty',
  pre: requireAll(S.AT_TARGET, S.TARGET_DEAD, S.BOUNTY_KNOWN),
  eff: requireAll(S.HAS_GOLD),
  classes: 'all',
  cost: () => 1,
  isValid: (a) => a.blackboard.knownFlags.length > 0,
  bind: (a) => a.blackboard.knownFlags.length > 0,
  // The flags system resolves and pays claims; the action only registers interest.
  runtime: instantRuntime((a) => a.blackboard.knownFlags.length > 0),
};

/** Rogue-only, and worth +60% of monster loot value — docs/01-game-design.md §4.3. */
const LootCorpse: ActionDef = {
  id: 'LootCorpse',
  pre: requireAll(S.AT_TARGET, S.TARGET_DEAD),
  eff: requireAll(S.HAS_GOLD),
  classes: ['rogue'],
  cost: () => 2,
  isValid: (a, w) => {
    const t = w.get(a.blackboard.currentTarget);
    return t !== null && !t.alive && (t.purse?.gold ?? 0) > 0;
  },
  bind: (a, w) => w.get(a.blackboard.currentTarget) !== null,
  runtime: instantRuntime((a, w) => {
    const corpse = w.get(a.blackboard.currentTarget);
    const purse = purseOf(a, w);
    if (corpse?.purse === undefined || purse === undefined) return false;
    purse.gold += corpse.purse.gold;
    corpse.purse.gold = 0;
    return true;
  }),
};

const BuyPotion: ActionDef = {
  id: 'BuyPotion',
  pre: requireAll(S.AT_MARKET, S.HAS_GOLD),
  eff: merge(requireAll(S.HAS_POTION), requireNone(S.HAS_GOLD)),
  classes: 'all',
  cost: () => 3,
  isValid: (a, w) => (purseOf(a, w)?.gold ?? 0) >= POTION_COST,
  bind: () => true,
  runtime: instantRuntime((a, w) => {
    const self = agentEntity(a, w);
    if (self?.purse === undefined || self.equipment === undefined) return false;
    if (self.purse.gold < POTION_COST) return false;
    self.purse.gold -= POTION_COST;
    self.equipment.potions += 1;
    w.creditTreasury(POTION_COST, 'potion');
    return true;
  }),
};

const DrinkPotion: ActionDef = {
  id: 'DrinkPotion',
  pre: requireAll(S.HAS_POTION),
  // Clears IS_CRITICAL too. Survive's target state is SAFE and not-critical, so
  // without this no action in the game can satisfy it and every dying hero plans
  // null — which is precisely when the planner most needs to work.
  eff: merge(requireNone(S.IS_INJURED, S.IS_CRITICAL), requireNone(S.HAS_POTION)),
  classes: 'all',
  cost: () => 1,
  isValid: (a, w) => (agentEntity(a, w)?.equipment?.potions ?? 0) > 0,
  bind: () => true,
  runtime: instantRuntime((a, w) => {
    const self = agentEntity(a, w);
    if (self?.equipment === undefined || self.health === undefined) return false;
    if (self.equipment.potions <= 0) return false;
    self.equipment.potions -= 1;
    const healed = self.health.hp + self.health.maxHp * POTION_HEAL_FRACTION;
    self.health.hp = Math.min(self.health.maxHp, healed);
    return true;
  }),
};

const BuyUpgrade: ActionDef = {
  id: 'BuyUpgrade',
  pre: requireAll(S.AT_SMITH, S.HAS_GOLD, S.UPGRADE_AVAILABLE),
  eff: requireNone(S.HAS_GOLD, S.UPGRADE_AVAILABLE),
  classes: 'all',
  cost: () => 3,
  isValid: (a, w) => nextUpgrade(a, w) !== null,
  bind: () => true,
  runtime: instantRuntime((a, w) => {
    const choice = nextUpgrade(a, w);
    const self = agentEntity(a, w);
    if (choice === null || self?.purse === undefined || self.equipment === undefined) return false;
    self.purse.gold -= choice.cost;
    if (choice.slot === 'weapon') self.equipment.weaponTier = choice.tier;
    else self.equipment.armourTier = choice.tier;
    w.creditTreasury(choice.cost, 'upgrade');
    return true;
  }),
};

/** The cheapest affordable upgrade, weapon before armour. Null when nothing is worth buying. */
export function nextUpgrade(
  a: Agent,
  w: WorldView,
): { slot: 'weapon' | 'armour'; tier: 1 | 2; cost: number } | null {
  const self = agentEntity(a, w);
  if (self?.equipment === undefined || self.purse === undefined) return null;
  const gold = self.purse.gold;

  const weaponNext = self.equipment.weaponTier + 1;
  if (weaponNext <= 2) {
    const cost = WEAPON_TIERS[weaponNext]?.cost ?? Number.POSITIVE_INFINITY;
    if (gold >= cost) return { slot: 'weapon', tier: weaponNext as 1 | 2, cost };
  }
  const armourNext = self.equipment.armourTier + 1;
  if (armourNext <= 2) {
    const cost = ARMOUR_TIERS[armourNext]?.cost ?? Number.POSITIVE_INFINITY;
    if (gold >= cost) return { slot: 'armour', tier: armourNext as 1 | 2, cost };
  }
  return null;
}

const RestAtInn: ActionDef = {
  id: 'RestAtInn',
  pre: requireAll(S.AT_INN, S.HAS_GOLD),
  eff: merge(requireAll(S.IS_RESTED), requireNone(S.IS_INJURED, S.IS_CRITICAL, S.HAS_GOLD)),
  classes: 'all',
  cost: () => 5,
  isValid: (a, w) => (purseOf(a, w)?.gold ?? 0) >= INN_REST_COST,
  bind: () => true,
  runtime: {
    start(a, w) {
      const purse = purseOf(a, w);
      if (purse !== undefined && purse.gold >= INN_REST_COST) {
        purse.gold -= INN_REST_COST;
        w.creditTreasury(INN_REST_COST, 'inn');
      }
      a.blackboard.sensorDue.restUntil = w.tick + INN_REST_TICKS;
    },
    tick(a, w): StepResult {
      const health = healthOf(a, w);
      if (health === undefined) return 'failure';
      const until = a.blackboard.sensorDue.restUntil ?? 0;
      // Full heal spread over 20 s rather than granted instantly, so a resting hero
      // is visibly out of the fight for a while.
      const perTick = health.maxHp / INN_REST_TICKS;
      health.hp = Math.min(health.maxHp, health.hp + perTick);
      return w.tick >= until ? 'success' : 'running';
    },
    stillValid(a, w) {
      return w.isAlive(a.blackboard.nearestShop.inn);
    },
    abort() {},
  },
};

/**
 * Cheap in gold, expensive in plan cost. That single asymmetry is what makes heroes
 * prefer the inn when they can afford it and trudge home when they cannot — emergent
 * from two numbers, not scripted.
 */
const HealAtGuild: ActionDef = {
  id: 'HealAtGuild',
  pre: requireAll(S.AT_HOME_GUILD),
  eff: requireNone(S.IS_INJURED, S.IS_CRITICAL),
  classes: 'all',
  cost: () => 25,
  isValid: (a, w) => w.isAlive(a.blackboard.homeGuild),
  bind: () => true,
  runtime: {
    start() {},
    tick(a, w): StepResult {
      const health = healthOf(a, w);
      if (health === undefined) return 'failure';
      health.hp = Math.min(health.maxHp, health.hp + GUILD_HEAL_PER_TICK);
      return health.hp >= health.maxHp ? 'success' : 'running';
    },
    stillValid(a, w) {
      return w.isAlive(a.blackboard.homeGuild);
    },
    abort() {},
  },
};

/** Cost falls as courage rises: 8 / (2 - courage) — docs/04-ai-spec.md §3. */
const Flee: ActionDef = {
  id: 'Flee',
  pre: requireAll(S.THREAT_NEARBY),
  eff: merge(requireAll(S.SAFE), requireNone(S.THREAT_NEARBY)),
  classes: 'all',
  cost: (a) => {
    const denom = 2 - a.traits.courage;
    return denom <= 0.05 ? 160 : 8 / denom;
  },
  isValid: () => true,
  bind: () => true,
  runtime: {
    start(a, w) {
      const self = agentEntity(a, w);
      const threat = w.get(a.blackboard.nearestThreat);
      if (self === null) return;
      // Directly away from the threat. Away from *nothing* is home.
      const home = handlePosition(w, a.blackboard.homeGuild);
      if (threat === null) {
        setDestination(a, w, home === null ? null : toTile(home));
        return;
      }
      const dx = self.transform.x - threat.transform.x;
      const dy = self.transform.y - threat.transform.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < 0.001) {
        setDestination(a, w, home === null ? null : toTile(home));
        return;
      }
      const flee = 10;
      setDestination(a, w, {
        tx: Math.round(self.transform.x + (dx / d) * flee),
        ty: Math.round(self.transform.y + (dy / d) * flee),
      });
    },
    tick(a, w): StepResult {
      return w.isAlive(a.blackboard.nearestThreat) ? 'running' : 'success';
    },
    stillValid() {
      return true;
    },
    abort(a, w) {
      setDestination(a, w, null);
    },
  },
};

/** Exploring costs a 20% premium over walking somewhere known — you may find nothing. */
const ExploreTile: ActionDef = {
  id: 'ExploreTile',
  pre: makeState(0, 0),
  eff: requireAll(S.TARGET_KNOWN),
  classes: 'all',
  cost: (a, w) => {
    const frontier = a.blackboard.frontierTile;
    if (frontier === null) return 60;
    return travelCost(a, w, { x: frontier.tx, y: frontier.ty }) * 1.2;
  },
  isValid: (a) => a.blackboard.frontierTile !== null,
  bind: (a) => a.blackboard.frontierTile !== null,
  runtime: moveRuntime((a) => a.blackboard.frontierTile),
};

/**
 * Deliberately expensive and always satisfiable. This is the guaranteed fallback that
 * makes "no plan found" a non-event rather than a stall — docs/04-ai-spec.md §3.
 */
const Idle: ActionDef = {
  id: 'Idle',
  pre: makeState(0, 0),
  eff: requireAll(S.SAFE),
  classes: 'all',
  cost: () => 50,
  isValid: () => true,
  bind: () => true,
  runtime: {
    start(a, w) {
      setDestination(a, w, null);
      a.idleSinceTick = w.tick;
    },
    tick(): StepResult {
      return 'running';
    },
    stillValid() {
      return true;
    },
    abort() {},
  },
};

export const ACTIONS: readonly ActionDef[] = [
  MoveToTarget,
  MoveToMarket,
  MoveToSmith,
  MoveToInn,
  MoveToGuild,
  Attack,
  ClaimBounty,
  LootCorpse,
  BuyPotion,
  DrinkPotion,
  BuyUpgrade,
  RestAtInn,
  HealAtGuild,
  Flee,
  ExploreTile,
  Idle,
];

export const ACTIONS_BY_ID = new Map(ACTIONS.map((a) => [a.id, a]));
