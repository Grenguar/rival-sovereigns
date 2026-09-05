/**
 * Shared test fixtures. Building an Agent by hand in every spec is how specs drift
 * apart from the contract.
 */

import type { World } from '../src/core/world';
import { NULL_HANDLE, type Agent, type AgentKindId, type Entity, type Traits } from '../src/core/types';
import { CLASSES } from '../src/content/classes';
import { EMPTY_STATE } from '../src/core/ai/goap/state';

export function makeBlackboard() {
  return {
    visibleEnemies: [],
    nearestThreat: NULL_HANDLE,
    nearestShop: { market: NULL_HANDLE, smith: NULL_HANDLE, inn: NULL_HANDLE },
    homeGuild: NULL_HANDLE,
    knownLairs: new Set<never>(),
    knownFlags: [],
    currentTarget: NULL_HANDLE,
    lastDamageFrom: NULL_HANDLE,
    damagedBuilding: NULL_HANDLE,
    frontierTile: null,
    sensorDue: {},
  };
}

export interface AgentFixture {
  world: World;
  entity: Entity;
  agent: Agent;
}

/** A hero with combat, purse, equipment and movement wired up, standing at (x, y). */
export function makeHero(
  world: World,
  classId: AgentKindId = 'warrior',
  x = 0,
  y = 0,
): AgentFixture {
  const def = CLASSES[classId];
  const entity = world.spawn({ kind: 'hero', faction: 'crown', x, y });

  entity.health = { hp: def?.hp ?? 100, maxHp: def?.hp ?? 100 };
  entity.combat = {
    damage: def?.damage ?? 10,
    range: def?.range ?? 1,
    armour: def?.armour ?? 0,
    attackInterval: def?.attackInterval ?? 12,
    nextAttackTick: 0,
    target: NULL_HANDLE,
    lastDamageFrom: NULL_HANDLE,
    lastDamageTick: -1,
  };
  entity.movement = {
    speed: def?.speed ?? 1,
    path: [],
    pathIndex: 0,
    pathTopologyVersion: 0,
    destination: null,
  };
  entity.purse = { gold: 0 };
  entity.equipment = { weaponTier: 0, armourTier: 0, potions: 0 };
  entity.progression = { level: 1, xp: 0 };

  const traits: Traits = def?.traits ?? { greed: 1, courage: 1, curiosity: 1, loyalty: 1 };

  const agent: Agent = {
    entity: entity.handle,
    classId,
    name: `Test ${classId}`,
    traits: { ...traits },
    currentGoal: null,
    goalScores: [],
    plan: null,
    currentState: { ...EMPTY_STATE },
    blackboard: makeBlackboard(),
    nextGoalTick: 0,
    nextPlanTick: 0,
    history: [],
    idleSinceTick: 0,
  };
  entity.agent = agent;

  return { world, entity, agent };
}

/** A monster, using the same agent stack with different weights. */
export function makeMonster(world: World, kind: AgentKindId = 'ratkin', x = 10, y = 10) {
  const fixture = makeHero(world, kind, x, y);
  fixture.entity.kind = 'monster';
  fixture.entity.faction = 'monsters';
  return fixture;
}
