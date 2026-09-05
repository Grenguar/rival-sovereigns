/**
 * Entity construction. One place that knows how to turn a content definition into a
 * live entity, so a new component never has to be remembered in six spawn sites.
 */

import {
  NULL_HANDLE,
  type AgentKindId,
  type BuildingKind,
  type ClassId,
  type Entity,
  type HenchmanKind,
  type LairKind,
  type MonsterKind,
  type TileCoord,
  type Traits,
} from './types';
import type { World } from './world';
import { CLASSES } from '../content/classes';
import { BUILDINGS } from '../content/buildings';
import { HENCHMEN, LAIRS, MONSTERS } from '../content/monsters';
import { createBlackboard } from './ai/blackboard';
import { pickName } from '../content/names';
import { FIRST_SPAWN_TICK } from '../content/balance';

function attachAgent(e: Entity, classId: AgentKindId, name: string, traits: Traits): void {
  e.agent = {
    entity: e.handle,
    classId,
    name,
    traits,
    currentGoal: null,
    goalScores: [],
    plan: null,
    currentState: { values: 0, mask: 0 },
    blackboard: createBlackboard(),
    nextGoalTick: 0,
    nextPlanTick: 0,
    history: [],
    idleSinceTick: 0,
  };
}

/**
 * Traits are jittered +/-20% per hero at spawn, which is what makes two warriors
 * from the same guild behave slightly differently — docs/01-game-design.md §4.2.
 */
export function createHero(w: World, classId: ClassId, tile: TileCoord): Entity | null {
  const def = CLASSES[classId];
  if (def === undefined) return null;

  const e = w.spawn({ kind: 'hero', faction: 'crown', x: tile.tx, y: tile.ty });
  e.health = { hp: def.hp, maxHp: def.hp };
  e.combat = {
    damage: def.damage,
    range: def.range,
    armour: def.armour,
    attackInterval: def.attackInterval,
    nextAttackTick: 0,
    target: NULL_HANDLE,
    lastDamageFrom: NULL_HANDLE,
    lastDamageTick: -1,
  };
  e.movement = {
    speed: def.speed,
    path: [],
    pathIndex: 0,
    pathTopologyVersion: w.topologyVersion,
    destination: null,
  };
  e.purse = { gold: 0 };
  e.equipment = { weaponTier: 0, armourTier: 0, potions: 0 };
  e.progression = { level: 1, xp: 0 };

  const traits: Traits = {
    greed: w.rng.jitter(def.traits.greed, def.traitJitter),
    courage: w.rng.jitter(def.traits.courage, def.traitJitter),
    curiosity: w.rng.jitter(def.traits.curiosity, def.traitJitter),
    loyalty: w.rng.jitter(def.traits.loyalty, def.traitJitter),
  };
  attachAgent(e, classId, pickName(classId, w.rng), traits);
  return e;
}

export function createMonster(w: World, kind: MonsterKind, tile: TileCoord): Entity | null {
  const def = MONSTERS[kind];
  if (def === undefined) return null;

  const e = w.spawn({ kind: 'monster', faction: 'monsters', x: tile.tx, y: tile.ty });
  e.health = { hp: def.hp, maxHp: def.hp };
  e.combat = {
    damage: def.damage,
    range: def.range,
    armour: def.armour,
    attackInterval: def.attackInterval,
    nextAttackTick: 0,
    target: NULL_HANDLE,
    lastDamageFrom: NULL_HANDLE,
    lastDamageTick: -1,
  };
  e.movement = {
    speed: def.speed,
    path: [],
    pathIndex: 0,
    pathTopologyVersion: w.topologyVersion,
    destination: null,
  };
  e.purse = { gold: 0 };
  e.progression = { level: 1, xp: 0 };
  attachAgent(e, kind, def.label, { ...def.traits });
  return e;
}

/** Henchmen are numbered, not named — the contrast with heroes is intentional. */
export function createHenchman(
  w: World,
  kind: HenchmanKind,
  tile: TileCoord,
  post: TileCoord | null = null,
): Entity | null {
  const def = HENCHMEN[kind];
  if (def === undefined) return null;

  const e = w.spawn({ kind: 'henchman', faction: 'crown', x: tile.tx, y: tile.ty });
  e.health = { hp: def.hp, maxHp: def.hp };
  e.combat = {
    damage: def.damage,
    range: def.range,
    armour: def.armour,
    attackInterval: def.attackInterval,
    nextAttackTick: 0,
    target: NULL_HANDLE,
    lastDamageFrom: NULL_HANDLE,
    lastDamageTick: -1,
  };
  e.movement = {
    speed: def.speed,
    path: [],
    pathIndex: 0,
    pathTopologyVersion: w.topologyVersion,
    destination: null,
  };
  e.purse = { gold: 0 };
  e.fsm = {
    kind,
    state: kind === 'guard' ? 'Patrol' : 'Idle',
    timer: 0,
    post: post ?? tile,
    carrying: 0,
    targetSite: NULL_HANDLE,
  };
  return e;
}

export function createBuilding(
  w: World,
  kind: BuildingKind,
  tile: TileCoord,
  complete = true,
): Entity | null {
  const def = BUILDINGS[kind];
  if (def === undefined) return null;

  const e = w.spawn({ kind: 'building', faction: 'crown', x: tile.tx, y: tile.ty });
  e.health = { hp: complete ? def.hp : 1, maxHp: def.hp };

  const footprint: TileCoord[] = [];
  for (let dx = 0; dx < def.footprint.w; dx++) {
    for (let dy = 0; dy < def.footprint.h; dy++) {
      footprint.push({ tx: tile.tx + dx, ty: tile.ty + dy });
    }
  }
  e.building = {
    kind,
    state: complete ? 'complete' : 'underConstruction',
    progress: complete ? 1 : 0,
    level: 1,
    vault: 0,
    spawnCooldown: def.spawnInterval,
    footprint,
  };
  // Placement changes walkability, so anyone holding a path across it repaths.
  w.topologyVersion++;
  return e;
}

export function createLair(w: World, kind: LairKind, tile: TileCoord): Entity | null {
  const def = LAIRS[kind];
  if (def === undefined) return null;

  const e = w.spawn({ kind: 'lair', faction: 'monsters', x: tile.tx, y: tile.ty });
  e.health = { hp: def.hp, maxHp: def.hp };
  e.lair = { kind, wave: 0, nextSpawnTick: FIRST_SPAWN_TICK };
  return e;
}

export function createFlag(
  w: World,
  kind: 'attack' | 'explore',
  tile: TileCoord,
  gold: number,
  target = NULL_HANDLE,
): Entity {
  const e = w.spawn({ kind: 'flag', faction: 'crown', x: tile.tx, y: tile.ty });
  e.flag = { kind, gold, target, tile, claimants: [], resolved: false };
  return e;
}
