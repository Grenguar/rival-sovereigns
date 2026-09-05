/**
 * C8 — monsters, lairs and henchmen. Numbers from docs/01-game-design.md §6–§7.
 *
 * Monsters run the same three-tier stack as heroes with different weights: no greed,
 * no shopping, and courage high enough to be stupid. That is deliberate — see
 * docs/04-ai-spec.md §9.
 */

import {
  parseTable,
  MonsterDefSchema,
  LairDefSchema,
  HenchmanDefSchema,
  type MonsterDef,
  type LairDef,
  type HenchmanDef,
} from '../schema';

/** Brave to the point of stupidity, and uninterested in money. */
const MONSTER_TRAITS = { greed: 0, courage: 1.8, curiosity: 0.5, loyalty: 0 };

const rawMonsters = {
  ratkin: {
    id: 'ratkin',
    label: 'Ratkin',
    hp: 45,
    damage: 7,
    range: 1,
    speed: 1.0,
    armour: 0,
    attackInterval: 12,
    visionRadius: 4,
    loot: 25,
    xp: 20,
    targetBias: 'structure',
    traits: MONSTER_TRAITS,
    goalMultipliers: { AttackStructure: 1.0, AttackHenchman: 0, Survive: 0.3, Idle: 0.05 },
  },
  goblin: {
    id: 'goblin',
    label: 'Goblin',
    hp: 70,
    damage: 11,
    range: 1,
    speed: 1.1,
    armour: 0,
    attackInterval: 12,
    visionRadius: 4,
    loot: 45,
    xp: 40,
    // The design's sharpest tooth: goblins attack the economy, not the army, and
    // the player has no direct way to protect henchmen.
    targetBias: 'henchman',
    traits: MONSTER_TRAITS,
    goalMultipliers: { AttackStructure: 1.0, AttackHenchman: 1.2, Survive: 0.3, Idle: 0.05 },
  },
  goblinRaider: {
    id: 'goblinRaider',
    label: 'Goblin Raider',
    hp: 90,
    damage: 15,
    range: 1,
    speed: 1.2,
    armour: 1,
    attackInterval: 12,
    visionRadius: 4,
    loot: 70,
    xp: 65,
    targetBias: 'henchman',
    traits: MONSTER_TRAITS,
    goalMultipliers: { AttackStructure: 1.0, AttackHenchman: 1.2, Survive: 0.3, Idle: 0.05 },
  },
};

const rawLairs = {
  ratkinWarren: {
    id: 'ratkinWarren',
    label: 'Ratkin Warren',
    hp: 350,
    spawns: [{ monster: 'ratkin', count: 2, fromWave: 1 }],
    spawnInterval: 450, // 45 s
    escalationPerWave: 0.05,
    escalationFloor: 0.6,
  },
  goblinCamp: {
    id: 'goblinCamp',
    label: 'Goblin Camp',
    hp: 500,
    spawns: [
      { monster: 'goblin', count: 1, fromWave: 1 },
      { monster: 'goblinRaider', count: 1, fromWave: 4 },
    ],
    spawnInterval: 700, // 70 s
    escalationPerWave: 0.05,
    escalationFloor: 0.6,
  },
};

const rawHenchmen = {
  peasant: {
    id: 'peasant',
    label: 'Peasant',
    hp: 40,
    damage: 0, // peasants do not fight
    range: 1,
    speed: 1.0,
    armour: 0,
    attackInterval: 12,
    cap: 4,
    replaceDelay: 150, // 15 s
  },
  taxCollector: {
    id: 'taxCollector',
    label: 'Tax Collector',
    hp: 35,
    damage: 0,
    range: 1,
    speed: 1.1,
    armour: 0,
    attackInterval: 12,
    cap: 2,
    replaceDelay: 150,
  },
  guard: {
    id: 'guard',
    label: 'Guard',
    hp: 90,
    // Damage and armour are not in the design doc; these sit between a ratkin and a
    // warrior so a guardhouse is worth its 300 gold without replacing a hero.
    damage: 10,
    range: 1,
    speed: 1.0,
    armour: 2,
    attackInterval: 12,
    cap: 2, // per guardhouse
    replaceDelay: 150,
  },
};

export const MONSTERS: Record<string, MonsterDef> = parseTable(
  MonsterDefSchema,
  rawMonsters,
  'monster',
);
export const LAIRS: Record<string, LairDef> = parseTable(LairDefSchema, rawLairs, 'lair');
export const HENCHMEN: Record<string, HenchmanDef> = parseTable(
  HenchmanDefSchema,
  rawHenchmen,
  'henchman',
);

/** Guards never leave this radius of their post, even mid-chase — docs §8. */
export const GUARD_LEASH_RADIUS = 8;
