/**
 * C2 — declarative content, validated at load.
 *
 * docs/02-architecture.md §11: adding content must not mean adding logic. Every
 * class, building, monster and lair is data checked by these schemas, and a bad
 * definition fails at load with a message naming the offending field rather than
 * surfacing as a mysterious NaN twenty thousand ticks later.
 */

import { z } from 'zod';

const positive = z.number().positive();
const nonNegative = z.number().nonnegative();

/** Trait weights run 0..1.8 — docs/01-game-design.md §4.2. */
const trait = z.number().min(0).max(1.8);

export const TraitsSchema = z.object({
  greed: trait,
  courage: trait,
  curiosity: trait,
  loyalty: trait,
});

export const ClassDefSchema = z.object({
  id: z.enum(['warrior', 'ranger', 'rogue']),
  label: z.string().min(1),
  hp: positive,
  damage: positive,
  /** Tiles. Melee is 1, the ranger's bow is 5. */
  range: positive,
  /** Tiles per second. */
  speed: positive,
  armour: nonNegative,
  recruitCost: positive,
  guild: z.enum(['warriorsGuild', 'roguesGuild', 'rangersLodge']),
  /** Ticks between swings: 1.2 s melee = 12, 1.6 s ranged = 16 at 10 Hz. */
  attackInterval: z.number().int().positive(),
  /** Fog reveal radius in tiles. Rangers see 6, everyone else 4. */
  visionRadius: positive,
  traits: TraitsSchema,
  /** Trait jitter applied at spawn, as a fraction. */
  traitJitter: z.number().min(0).max(1),
  /** Gold above which the hero considers itself solvent — the HAS_GOLD threshold. */
  spendThreshold: positive,
  goalMultipliers: z.record(z.string(), z.number().nonnegative()),
});

export const BuildingDefSchema = z.object({
  id: z.enum([
    'palace',
    'warriorsGuild',
    'roguesGuild',
    'rangersLodge',
    'marketplace',
    'blacksmith',
    'inn',
    'guardhouse',
  ]),
  label: z.string().min(1),
  /** The palace is pre-placed and has no cost. */
  cost: nonNegative,
  hp: positive,
  /** Minimum palace level required before this can be placed. */
  requiresPalaceLevel: z.number().int().min(1),
  footprint: z.object({ w: z.number().int().positive(), h: z.number().int().positive() }),
  spawns: z.enum(['warrior', 'ranger', 'rogue', 'peasant', 'taxCollector', 'guard']).nullable(),
  /** Ticks between spawns while below cap. 40 s = 400 ticks. */
  spawnInterval: z.number().int().nonnegative(),
  /** Build time in ticks at one peasant. */
  buildTicks: z.number().int().positive(),
});

export const MonsterDefSchema = z.object({
  id: z.enum(['ratkin', 'goblin', 'goblinRaider']),
  label: z.string().min(1),
  hp: positive,
  damage: positive,
  range: positive,
  speed: positive,
  armour: nonNegative,
  attackInterval: z.number().int().positive(),
  visionRadius: positive,
  loot: nonNegative,
  xp: nonNegative,
  /** Ratkin go for structures; goblins go for the economy. */
  targetBias: z.enum(['structure', 'henchman']),
  traits: TraitsSchema,
  goalMultipliers: z.record(z.string(), z.number().nonnegative()),
});

export const LairDefSchema = z.object({
  id: z.enum(['ratkinWarren', 'goblinCamp']),
  label: z.string().min(1),
  hp: positive,
  /** Spawn table entries gated by wave number. */
  spawns: z
    .array(
      z.object({
        monster: z.enum(['ratkin', 'goblin', 'goblinRaider']),
        count: z.number().int().positive(),
        fromWave: z.number().int().min(1),
      }),
    )
    .min(1),
  /** Base ticks between waves. */
  spawnInterval: z.number().int().positive(),
  /** Interval shrinks by this fraction per wave... */
  escalationPerWave: z.number().min(0).max(1),
  /** ...but never below this fraction of the base. */
  escalationFloor: z.number().min(0).max(1),
});

export const HenchmanDefSchema = z.object({
  id: z.enum(['peasant', 'taxCollector', 'guard']),
  label: z.string().min(1),
  hp: positive,
  damage: nonNegative,
  range: positive,
  speed: positive,
  armour: nonNegative,
  attackInterval: z.number().int().positive(),
  cap: z.number().int().positive(),
  /** Ticks before an auto-replacement is issued. 15 s = 150. */
  replaceDelay: z.number().int().nonnegative(),
});

export type ClassDef = z.infer<typeof ClassDefSchema>;
export type BuildingDef = z.infer<typeof BuildingDefSchema>;
export type MonsterDef = z.infer<typeof MonsterDefSchema>;
export type LairDef = z.infer<typeof LairDefSchema>;
export type HenchmanDef = z.infer<typeof HenchmanDefSchema>;

/**
 * Validates one definition and throws with the content id in the message. A
 * ZodError alone tells you a field is wrong but not which of eight buildings it
 * belongs to, which is exactly the thing you want to know.
 */
export function parseDef<T>(schema: z.ZodType<T>, raw: unknown, what: string): T {
  const result = schema.safeParse(raw);
  if (result.success) return result.data;

  const id =
    typeof raw === 'object' && raw !== null && 'id' in raw ? String((raw as { id: unknown }).id) : '<no id>';
  const issues = result.error.issues
    .map((i) => `  ${i.path.join('.') || '<root>'}: ${i.message}`)
    .join('\n');
  throw new Error(`Invalid ${what} "${id}":\n${issues}`);
}

/** Validates a table of definitions keyed by id, checking the key matches the id. */
export function parseTable<T extends { id: string }>(
  schema: z.ZodType<T>,
  raw: Record<string, unknown>,
  what: string,
): Record<string, T> {
  const out: Record<string, T> = {};
  for (const key of Object.keys(raw).sort()) {
    const def = parseDef(schema, raw[key], what);
    if (def.id !== key) {
      throw new Error(`Invalid ${what}: key "${key}" does not match its id "${def.id}"`);
    }
    out[key] = def;
  }
  return out;
}
