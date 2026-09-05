/**
 * A8a — the per-agent blackboard.
 *
 * Agents never query world state directly during scoring. That would couple AI cost
 * to world size and make heroes omniscient, breaking the knowledge design in
 * docs/01-game-design.md §9. Sensors write here on staggered schedules; scoring only
 * ever reads.
 */

import { NULL_HANDLE, type Blackboard, type EntityId } from '../types';

export function createBlackboard(): Blackboard {
  return {
    visibleEnemies: [],
    nearestThreat: NULL_HANDLE,
    nearestShop: { market: NULL_HANDLE, smith: NULL_HANDLE, inn: NULL_HANDLE },
    homeGuild: NULL_HANDLE,
    knownLairs: new Set<EntityId>(),
    knownFlags: [],
    currentTarget: NULL_HANDLE,
    lastDamageFrom: NULL_HANDLE,
    damagedBuilding: NULL_HANDLE,
    frontierTile: null,
    sensorDue: {},
  };
}

/** Sensor periods in ticks — docs/02-architecture.md §5. */
export const SENSOR_PERIOD = {
  vision: 5, // 500 ms
  threat: 10, // 1 s
  economic: 20, // 2 s
  frontier: 30, // 3 s, rangers only
} as const;

/** Tiles within which an enemy counts as a threat worth reacting to. */
export const THREAT_RADIUS = 8;
/** Tiles within which a hero notices a friendly building taking damage — §4. */
export const DEFEND_NOTICE_RADIUS = 20;
