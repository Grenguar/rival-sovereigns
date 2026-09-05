/**
 * C4 — hero names. docs/01-game-design.md §4.4: `[title] [given] [epithet]`, drawn from
 * class-specific pools at spawn.
 *
 * The 200 names per class are static content generated offline by `tools/gen-names.ts`,
 * not composed here. Spawning a hero therefore costs one integer draw from the world
 * generator and one array read, and a replay that reaches the same spawn with the same
 * RNG state gets the same name — which is what makes a bug report about "Sir Caldwyn"
 * reproducible on someone else's machine.
 */

import type { ClassId } from '../../core/types';
import type { Rng } from '../../core/rng';
import { WARRIOR_NAMES, RANGER_NAMES, ROGUE_NAMES } from './pools.gen';

export const NAMES_PER_CLASS = 200;

export const NAMES_BY_CLASS: Readonly<Record<ClassId, readonly string[]>> = {
  warrior: WARRIOR_NAMES,
  ranger: RANGER_NAMES,
  rogue: ROGUE_NAMES,
};

/**
 * The name at a caller-supplied index, wrapping rather than clamping so that a spawn
 * counter can be used directly without every hero past the 200th being called the same
 * thing.
 */
export function nameAt(classId: ClassId, index: number): string {
  const pool = NAMES_BY_CLASS[classId];
  // Two-step modulo: the JS % keeps the sign of the dividend, and a negative index would
  // otherwise read off the front of the array.
  const wrapped = ((index % pool.length) + pool.length) % pool.length;
  const name = pool[wrapped];
  if (name === undefined) throw new Error(`Empty name pool for class "${classId}"`);
  return name;
}

/**
 * Names a hero from the world's seeded generator. Exactly one draw is consumed per call,
 * so inserting or removing a naming call shifts the whole downstream stream — treat it
 * as part of the simulation, not as cosmetics.
 */
export function pickName(classId: ClassId, rng: Rng): string {
  return nameAt(classId, rng.nextInt(0, NAMES_BY_CLASS[classId].length));
}
