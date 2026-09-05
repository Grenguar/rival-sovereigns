/**
 * C3 — hero classes. Numbers come from docs/01-game-design.md §4.
 *
 * Traits are curve-variant selectors, never code branches. Four numbers per class
 * produce the documented behaviour: rogues reach bounties first, warriors defend,
 * rangers wander off and find things.
 */

import { parseTable, ClassDefSchema, type ClassDef } from '../schema';

const raw = {
  warrior: {
    id: 'warrior',
    label: 'Warrior',
    hp: 120,
    damage: 14,
    range: 1,
    speed: 1.0,
    armour: 3,
    recruitCost: 180,
    guild: 'warriorsGuild',
    attackInterval: 12, // 1.2 s melee at 10 Hz
    visionRadius: 4,
    traits: { greed: 0.8, courage: 1.5, curiosity: 0.7, loyalty: 1.4 },
    traitJitter: 0.2,
    // The price of a potion — the cheapest thing worth having gold for.
    spendThreshold: 40,
    goalMultipliers: { DefendHome: 1.0, Explore: 0.5, ClaimBounty: 1.0, HuntMonster: 1.0 },
  },
  ranger: {
    id: 'ranger',
    label: 'Ranger',
    hp: 70,
    damage: 11,
    range: 5,
    speed: 1.3,
    armour: 1,
    recruitCost: 200,
    guild: 'rangersLodge',
    attackInterval: 16, // 1.6 s ranged
    visionRadius: 6, // rangers reveal further — docs §4.3
    traits: { greed: 1.0, courage: 1.0, curiosity: 1.6, loyalty: 0.8 },
    traitJitter: 0.2,
    spendThreshold: 40,
    goalMultipliers: { DefendHome: 0.4, Explore: 1.0, ClaimBounty: 1.0, HuntMonster: 0.8 },
  },
  rogue: {
    id: 'rogue',
    label: 'Rogue',
    hp: 80,
    damage: 9,
    range: 1,
    speed: 1.5,
    armour: 1,
    recruitCost: 150,
    guild: 'roguesGuild',
    attackInterval: 12,
    visionRadius: 4,
    traits: { greed: 1.7, courage: 0.5, curiosity: 1.1, loyalty: 0.5 },
    traitJitter: 0.2,
    spendThreshold: 40,
    goalMultipliers: { DefendHome: 0.4, Explore: 0.5, ClaimBounty: 1.0, HuntMonster: 0.6 },
  },
};

export const CLASSES: Record<string, ClassDef> = parseTable(ClassDefSchema, raw, 'class');

export const CLASS_IDS = ['warrior', 'ranger', 'rogue'] as const;
