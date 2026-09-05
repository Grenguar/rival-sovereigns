/**
 * C7 — buildings. Numbers from docs/01-game-design.md §5.
 *
 * buildTicks derives from the documented peasant rate of 12 HP/s: hp / 12 * 10,
 * rounded up. It is written out rather than computed so a designer can break the
 * relationship for one building without touching code.
 */

import { parseTable, BuildingDefSchema, type BuildingDef } from '../schema';

const raw = {
  palace: {
    id: 'palace',
    label: 'Palace',
    cost: 0, // pre-placed; its destruction is defeat
    hp: 1000,
    requiresPalaceLevel: 1,
    footprint: { w: 3, h: 3 },
    // Spawns both peasants and tax collectors, which the table cannot express;
    // systems/spawning.ts owns the palace case.
    spawns: null,
    spawnInterval: 0,
    buildTicks: 834,
  },
  warriorsGuild: {
    id: 'warriorsGuild',
    label: "Warrior's Guild",
    cost: 700,
    hp: 400,
    requiresPalaceLevel: 1,
    footprint: { w: 2, h: 2 },
    spawns: 'warrior',
    spawnInterval: 400, // 40 s
    buildTicks: 334,
  },
  roguesGuild: {
    id: 'roguesGuild',
    label: "Rogues' Guild",
    cost: 650,
    hp: 350,
    requiresPalaceLevel: 1,
    footprint: { w: 2, h: 2 },
    spawns: 'rogue',
    spawnInterval: 400,
    buildTicks: 292,
  },
  rangersLodge: {
    id: 'rangersLodge',
    label: "Ranger's Lodge",
    cost: 800,
    hp: 350,
    requiresPalaceLevel: 2, // gated behind 3,000 cumulative tax revenue
    footprint: { w: 2, h: 2 },
    spawns: 'ranger',
    spawnInterval: 400,
    buildTicks: 292,
  },
  marketplace: {
    id: 'marketplace',
    label: 'Marketplace',
    cost: 350,
    hp: 300,
    requiresPalaceLevel: 1,
    footprint: { w: 2, h: 2 },
    spawns: null,
    spawnInterval: 0,
    buildTicks: 250,
  },
  blacksmith: {
    id: 'blacksmith',
    label: 'Blacksmith',
    cost: 500,
    hp: 350,
    requiresPalaceLevel: 1,
    footprint: { w: 2, h: 2 },
    spawns: null,
    spawnInterval: 0,
    buildTicks: 292,
  },
  inn: {
    id: 'inn',
    label: 'Inn',
    cost: 400,
    hp: 300,
    requiresPalaceLevel: 1,
    footprint: { w: 2, h: 2 },
    spawns: null,
    spawnInterval: 0,
    buildTicks: 250,
  },
  guardhouse: {
    id: 'guardhouse',
    label: 'Guardhouse',
    cost: 300,
    hp: 400,
    requiresPalaceLevel: 1,
    footprint: { w: 1, h: 1 },
    spawns: 'guard',
    spawnInterval: 150,
    buildTicks: 334,
  },
};

export const BUILDINGS: Record<string, BuildingDef> = parseTable(
  BuildingDefSchema,
  raw,
  'building',
);

/** Everything the player may place. The palace is pre-placed. */
export const PLACEABLE = Object.values(BUILDINGS).filter((b) => b.id !== 'palace');

/** Which guild spawns which class — the inverse of ClassDef.guild. */
export const GUILD_FOR_CLASS = {
  warrior: 'warriorsGuild',
  ranger: 'rangersLodge',
  rogue: 'roguesGuild',
} as const;
