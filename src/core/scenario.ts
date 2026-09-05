/**
 * World assembly: builds a playable kingdom and installs every system into the fixed
 * tick order of docs/02-architecture.md §2.2.
 *
 * This is the only place that knows the whole system list, which makes the tick order
 * reviewable in one screen instead of scattered across a dozen import sites.
 */

import { World } from './world';
import type { TileCoord } from './types';
import { createBuilding, createLair } from './factory';
import { STARTING_TREASURY, DEFAULT_TAX_RATE, MAX_TAX_RATE, MIN_TAX_RATE } from '../content/balance';
import { runSensors, linearProximityIndex } from './ai/sensors';
import { installAi } from './ai/agent-system';
import { fsmSystem } from './ai/fsm';
import { createMovementSystem } from './systems/movement';
import { combatSystem } from './systems/combat';
import { economySystem, outcomeSystem } from './systems/economy';
import { spawningSystem } from './systems/spawning';
import { flagSystem, cancelFlag, placeFlag } from './systems/flags';
import { fogSystem, innKnowledgeSystem } from './systems/fog';
import { cleanupSystem } from './systems/cleanup';
import { createFlag } from './factory';

export interface MissionSpec {
  width: number;
  height: number;
  palace: TileCoord;
  buildings: { kind: Parameters<typeof createBuilding>[1]; tile: TileCoord }[];
  lairs: { kind: Parameters<typeof createLair>[1]; tile: TileCoord }[];
}

/**
 * Mission 01, laid out per docs/01-game-design.md §10: palace slightly south-west of
 * centre, a tutorial warren to the north-east, a second to the south-west that
 * punishes ignoring it, and the goblin camp far east as the endgame target.
 */
export const MISSION_01: MissionSpec = {
  width: 96,
  height: 96,
  palace: { tx: 40, ty: 52 },
  buildings: [
    { kind: 'warriorsGuild', tile: { tx: 36, ty: 50 } },
    { kind: 'roguesGuild', tile: { tx: 44, ty: 50 } },
    { kind: 'marketplace', tile: { tx: 36, ty: 55 } },
    { kind: 'blacksmith', tile: { tx: 44, ty: 55 } },
    { kind: 'inn', tile: { tx: 40, ty: 57 } },
    // Two guards on a fixed post. Heroes are under no obligation to come home, so
    // without a standing garrison an unattended palace dies to the first waves —
    // well inside the five minutes §11 rules out for any configuration.
    { kind: 'guardhouse', tile: { tx: 41, ty: 50 } },
    { kind: 'guardhouse', tile: { tx: 39, ty: 54 } },
  ],
  lairs: [
    { kind: 'ratkinWarren', tile: { tx: 58, ty: 36 } }, // 22 tiles NE
    { kind: 'ratkinWarren', tile: { tx: 20, ty: 72 } }, // 30 tiles SW
    { kind: 'goblinCamp', tile: { tx: 86, ty: 50 } }, // 46 tiles E, past the river
  ],
};

/** Installs the systems in the documented tick order. Order here is the contract. */
export function installSystems(w: World): void {
  const proximity = linearProximityIndex(w);

  w.hooks.sensors.push((world) => runSensors(world, world.views.agents, proximity));
  installAi(w); // phases 3, 4, 5
  w.hooks.fsm.push(fsmSystem);
  w.hooks.movement.push(createMovementSystem());
  w.hooks.combat.push(combatSystem);
  w.hooks.economy.push(economySystem);
  w.hooks.spawning.push(spawningSystem);
  w.hooks.flags.push(flagSystem);
  w.hooks.cleanup.push(cleanupSystem);
  w.hooks.cleanup.push(outcomeSystem);
  w.hooks.fog.push(fogSystem);
  w.hooks.fog.push(innKnowledgeSystem);

  w.commandHandlers.push(handleCommand);
}

function handleCommand(c: Parameters<NonNullable<World['commandHandlers'][number]>>[0], w: World): void {
  switch (c.t) {
    case 'SET_TAX_RATE': {
      const r = c.rate;
      w.taxRate = r < MIN_TAX_RATE ? MIN_TAX_RATE : r > MAX_TAX_RATE ? MAX_TAX_RATE : r;
      return;
    }
    case 'PLACE_BUILDING': {
      const e = createBuilding(w, c.kind, c.tile, false);
      if (e === null) return;
      // Buildings are constructed over time by peasants and are destructible while
      // under construction — a raid on your half-built lodge is a real loss.
      return;
    }
    case 'PLACE_FLAG': {
      const tile = 'tx' in c.target ? c.target : { tx: 0, ty: 0 };
      const target = 'tx' in c.target ? { index: -1, generation: -1 } : c.target;
      const flag = createFlag(w, c.kind, tile, c.gold, target);
      if (!placeFlag(w, flag)) w.kill(flag.handle); // unaffordable
      return;
    }
    case 'CANCEL_FLAG':
      cancelFlag(w, c.id);
      return;
    case 'DEMOLISH': {
      for (const b of w.views.buildings) {
        if (b.id === c.id) w.kill(b.handle);
      }
      return;
    }
  }
}

export interface ScenarioOptions {
  seed: number;
  mission?: MissionSpec;
  treasury?: number;
  taxRate?: number;
}

export function createScenario(options: ScenarioOptions): World {
  const mission = options.mission ?? MISSION_01;
  const w = new World(options.seed);
  w.treasury = options.treasury ?? STARTING_TREASURY;
  w.taxRate = options.taxRate ?? DEFAULT_TAX_RATE;

  createBuilding(w, 'palace', mission.palace, true);
  for (const b of mission.buildings) createBuilding(w, b.kind, b.tile, true);
  for (const l of mission.lairs) createLair(w, l.kind, l.tile);

  installSystems(w);
  return w;
}
