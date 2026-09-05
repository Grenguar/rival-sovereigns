/**
 * A8 — staggered sensing, and the bridge from world state to planning symbols.
 *
 * Two responsibilities, deliberately together: the sensors fill the blackboard, and
 * `computeCurrentState` turns the blackboard plus the agent's own body into the
 * 32-bit symbol set the planner searches over. Keeping them adjacent is what stops
 * the two drifting — a symbol that no sensor feeds is a symbol that is always false.
 */

import {
  S,
  type Agent,
  type Entity,
  type Handle,
  type State,
  type WorldView,
} from '../types';
import { NULL_HANDLE } from '../types';
import { CLASSES } from '../../content/classes';
import { ARRIVAL_RADIUS } from './goap/actions';
import { DEFEND_NOTICE_RADIUS, SENSOR_PERIOD, THREAT_RADIUS } from './blackboard';

/**
 * Proximity lookup. The architecture calls for the 64px spatial hash to serve every
 * proximity query, but that lives in Track B; this interface is the seam. The default
 * implementation is a linear scan in id order, which is correct and — at eighty
 * agents behind a stagger — not yet worth optimising.
 */
export interface ProximityIndex {
  near(x: number, y: number, radius: number): Entity[];
}

export function linearProximityIndex(w: WorldView): ProximityIndex {
  return {
    near(x, y, radius) {
      const r2 = radius * radius;
      const out: Entity[] = [];
      // entitiesInIdOrder is the canonical order, so results are stable.
      for (const e of w.entitiesInIdOrder()) {
        if (!e.alive) continue;
        const dx = e.transform.x - x;
        const dy = e.transform.y - y;
        if (dx * dx + dy * dy <= r2) out.push(e);
      }
      return out;
    },
  };
}

const distSq = (a: Entity, b: { x: number; y: number }): number => {
  const dx = a.transform.x - b.x;
  const dy = a.transform.y - b.y;
  return dx * dx + dy * dy;
};

const hostile = (a: Entity, b: Entity): boolean =>
  a.faction !== b.faction && b.faction !== 'neutral';

/** Runs a sensor when its period is up, staggered by entity id so the cost spreads. */
function due(a: Agent, w: WorldView, name: string, period: number): boolean {
  const next = a.blackboard.sensorDue[name];
  if (next !== undefined && w.tick < next) return false;
  const self = w.get(a.entity);
  const stagger = self === null ? 0 : self.id % period;
  a.blackboard.sensorDue[name] = w.tick + period + (next === undefined ? stagger : 0);
  return true;
}

// ── individual sensors ──────────────────────────────────────────────────────

export function visionSensor(a: Agent, w: WorldView, index: ProximityIndex): void {
  const self = w.get(a.entity);
  if (self === null) return;
  const radius = CLASSES[a.classId]?.visionRadius ?? 4;

  const seen: Handle[] = [];
  for (const e of index.near(self.transform.x, self.transform.y, radius)) {
    if (e.id === self.id) continue;
    if (hostile(self, e)) seen.push(e.handle);
  }
  a.blackboard.visibleEnemies = seen;
}

export function threatSensor(a: Agent, w: WorldView, index: ProximityIndex): void {
  const self = w.get(a.entity);
  if (self === null) return;

  let nearest: Entity | null = null;
  let nearestD2 = Number.POSITIVE_INFINITY;
  for (const e of index.near(self.transform.x, self.transform.y, THREAT_RADIUS)) {
    if (e.id === self.id || !hostile(self, e) || e.combat === undefined) continue;
    const d2 = distSq(e, self.transform);
    // Ties break by id: two equidistant threats must resolve the same way on every
    // engine — docs/03-determinism.md §4.5.
    if (d2 < nearestD2 || (d2 === nearestD2 && nearest !== null && e.id < nearest.id)) {
      nearest = e;
      nearestD2 = d2;
    }
  }
  a.blackboard.nearestThreat = nearest === null ? NULL_HANDLE : nearest.handle;

  // A friendly building under attack, for DefendHome.
  let damaged: Entity | null = null;
  let damagedD2 = Number.POSITIVE_INFINITY;
  for (const b of index.near(self.transform.x, self.transform.y, DEFEND_NOTICE_RADIUS)) {
    if (b.building === undefined || b.faction !== self.faction || b.health === undefined) continue;
    if (b.health.hp >= b.health.maxHp) continue;
    const d2 = distSq(b, self.transform);
    if (d2 < damagedD2 || (d2 === damagedD2 && damaged !== null && b.id < damaged.id)) {
      damaged = b;
      damagedD2 = d2;
    }
  }
  a.blackboard.damagedBuilding = damaged === null ? NULL_HANDLE : damaged.handle;
}

/** Shop and guild locations. Trivial cost, so it runs rarely and scans everything. */
export function economicSensor(a: Agent, w: WorldView): void {
  const self = w.get(a.entity);
  if (self === null) return;

  const homeGuildKind = CLASSES[a.classId]?.guild;
  let market: Entity | null = null;
  let smith: Entity | null = null;
  let inn: Entity | null = null;
  let guild: Entity | null = null;

  const closer = (candidate: Entity, best: Entity | null): boolean => {
    if (best === null) return true;
    const dc = distSq(candidate, self.transform);
    const db = distSq(best, self.transform);
    return dc < db || (dc === db && candidate.id < best.id);
  };

  for (const e of w.entitiesInIdOrder()) {
    if (e.building === undefined || !e.alive) continue;
    if (e.building.state !== 'complete' && e.building.state !== 'damaged') continue;
    if (e.faction !== self.faction) continue;

    switch (e.building.kind) {
      case 'marketplace':
        if (closer(e, market)) market = e;
        break;
      case 'blacksmith':
        if (closer(e, smith)) smith = e;
        break;
      case 'inn':
        if (closer(e, inn)) inn = e;
        break;
      default:
        if (e.building.kind === homeGuildKind && closer(e, guild)) guild = e;
        break;
    }
  }

  a.blackboard.nearestShop = {
    market: market === null ? NULL_HANDLE : market.handle,
    smith: smith === null ? NULL_HANDLE : smith.handle,
    inn: inn === null ? NULL_HANDLE : inn.handle,
  };
  if (guild !== null) a.blackboard.homeGuild = guild.handle;
}

/**
 * Flag awareness is event-driven rather than periodic — §5. The flags system calls
 * this when a flag is placed or cancelled within an agent's knowledge.
 */
export function noteFlag(a: Agent, flag: Entity): void {
  if (flag.flag === undefined) return;
  const existing = a.blackboard.knownFlags.findIndex((f) => f.id === flag.id);
  const entry = { id: flag.id, gold: flag.flag.gold, tile: flag.flag.tile };
  if (existing >= 0) a.blackboard.knownFlags[existing] = entry;
  else a.blackboard.knownFlags.push(entry);
  // Sorted by id so scoring sees a stable order regardless of discovery sequence.
  a.blackboard.knownFlags.sort((x, y) => x.id - y.id);
}

export function forgetFlag(a: Agent, id: number): void {
  a.blackboard.knownFlags = a.blackboard.knownFlags.filter((f) => f.id !== id);
}

// ── the scheduler ───────────────────────────────────────────────────────────

/**
 * Tick phase 2. Each sensor is gated on its own period, so no system costing more
 * than ~10 µs per agent ever runs for every agent every tick — the primary lever in
 * docs/02-architecture.md §7.
 */
export function runSensors(w: WorldView, agents: readonly Entity[], index: ProximityIndex): void {
  for (const e of agents) {
    const a = e.agent;
    if (a === undefined || !e.alive) continue;

    if (due(a, w, 'vision', SENSOR_PERIOD.vision)) visionSensor(a, w, index);
    if (due(a, w, 'threat', SENSOR_PERIOD.threat)) threatSensor(a, w, index);
    if (due(a, w, 'economic', SENSOR_PERIOD.economic)) economicSensor(a, w);

    a.currentState = computeCurrentState(a, w);
  }
}

// ── world state → planning symbols ──────────────────────────────────────────

/** Buildings are large; "at" one means within a couple of tiles of its origin. */
const AT_BUILDING_SQ = 3 * 3;

function atHandle(self: Entity, w: WorldView, h: Handle, radiusSq: number): boolean {
  const target = w.get(h);
  if (target === null) return false;
  return distSq(self, target.transform) <= radiusSq;
}

/**
 * Every symbol in docs/04-ai-spec.md §2, computed from the body and the blackboard.
 *
 * The mask is full: the agent knows the truth of every symbol about itself. A
 * partially-masked current state would let the planner treat "unknown" as
 * "satisfied", which is how an agent ends up planning around a fact it never checked.
 */
export function computeCurrentState(a: Agent, w: WorldView): State {
  const self = w.get(a.entity);
  if (self === null) return { values: 0, mask: 0 };

  let v = 0;
  const bb = a.blackboard;

  const gold = self.purse?.gold ?? 0;
  const threshold = CLASSES[a.classId]?.spendThreshold ?? Number.POSITIVE_INFINITY;
  if (gold >= threshold) v |= S.HAS_GOLD;

  const target = w.get(bb.currentTarget);
  if (target !== null) {
    v |= S.TARGET_KNOWN;
    if (!target.alive) v |= S.TARGET_DEAD;
    // "At" a combat target means within weapon range, not touching it — otherwise a
    // ranger walks into melee to satisfy its own precondition.
    const reach = Math.max(self.combat?.range ?? 1, ARRIVAL_RADIUS);
    if (distSq(self, target.transform) <= reach * reach) v |= S.AT_TARGET;
  }

  const health = self.health;
  if (health !== undefined && health.maxHp > 0) {
    const ratio = health.hp / health.maxHp;
    if (ratio < 0.5) v |= S.IS_INJURED;
    if (ratio < 0.25) v |= S.IS_CRITICAL;
  }

  if ((self.equipment?.potions ?? 0) > 0) v |= S.HAS_POTION;

  if (atHandle(self, w, bb.nearestShop.market, AT_BUILDING_SQ)) v |= S.AT_MARKET;
  if (atHandle(self, w, bb.nearestShop.smith, AT_BUILDING_SQ)) v |= S.AT_SMITH;
  if (atHandle(self, w, bb.nearestShop.inn, AT_BUILDING_SQ)) v |= S.AT_INN;
  if (atHandle(self, w, bb.homeGuild, AT_BUILDING_SQ)) v |= S.AT_HOME_GUILD;

  const threat = w.get(bb.nearestThreat);
  if (threat !== null && threat.alive && distSq(self, threat.transform) <= THREAT_RADIUS * THREAT_RADIUS) {
    v |= S.THREAT_NEARBY;
  }

  if (bb.knownFlags.length > 0) v |= S.BOUNTY_KNOWN;
  if (bb.knownLairs.size > 0) v |= S.LAIR_KNOWN;

  const eq = self.equipment;
  if (eq !== undefined && (eq.weaponTier < 2 || eq.armourTier < 2)) v |= S.UPGRADE_AVAILABLE;

  const restedUntil = bb.sensorDue.restedUntil ?? -1;
  if (w.tick <= restedUntil) v |= S.IS_RESTED;

  if ((v & S.THREAT_NEARBY) === 0) v |= S.SAFE;

  return { values: v, mask: FULL_MASK };
}

/** Every symbol the agent knows about itself. */
export const FULL_MASK =
  S.HAS_GOLD |
  S.AT_TARGET |
  S.TARGET_DEAD |
  S.TARGET_KNOWN |
  S.IS_INJURED |
  S.IS_CRITICAL |
  S.HAS_POTION |
  S.AT_MARKET |
  S.AT_SMITH |
  S.AT_INN |
  S.AT_HOME_GUILD |
  S.THREAT_NEARBY |
  S.BOUNTY_KNOWN |
  S.LAIR_KNOWN |
  S.UPGRADE_AVAILABLE |
  S.IS_RESTED |
  S.SAFE;
