/**
 * Balance constants from docs/01-game-design.md §3, §4.5 and §4.6.
 *
 * Everything a tuning pass touches lives here, so H8's economy sweeps have one file
 * to vary rather than a scatter of literals across a dozen systems.
 */

/** Levels 1–5 — §4.5. Index 0 is level 1. Level 5 is the MVP cap. */
export const PROGRESSION = [
  { level: 1, xp: 0, hp: 1.0, damage: 1.0 },
  { level: 2, xp: 100, hp: 1.15, damage: 1.1 },
  { level: 3, xp: 250, hp: 1.32, damage: 1.21 },
  { level: 4, xp: 500, hp: 1.52, damage: 1.33 },
  { level: 5, xp: 900, hp: 1.75, damage: 1.46 },
] as const;

export const MAX_LEVEL = 5;

/** Damage multipliers by weapon tier — §4.6. Index is the tier. */
export const WEAPON_TIERS = [
  { tier: 0, cost: 0, damageMultiplier: 1.0 },
  { tier: 1, cost: 150, damageMultiplier: 1.2 },
  { tier: 2, cost: 400, damageMultiplier: 1.45 },
] as const;

/** Flat armour bonus by tier — §4.6. */
export const ARMOUR_TIERS = [
  { tier: 0, cost: 0, armourBonus: 0 },
  { tier: 1, cost: 180, armourBonus: 2 },
  { tier: 2, cost: 450, armourBonus: 5 },
] as const;

export const POTION_COST = 40;
/** A potion restores half of max HP. */
export const POTION_HEAL_FRACTION = 0.5;

export const INN_REST_COST = 25;
/** Full heal spread over 20 s. */
export const INN_REST_TICKS = 200;

/** The guild heals slowly and for free — the option for a hero who cannot pay. */
export const GUILD_HEAL_PER_TICK = 0.4;

// ── Economy — §3 ────────────────────────────────────────────────────────────

export const STARTING_TREASURY = 2000;
export const DEFAULT_TAX_RATE = 0.2;
export const MIN_TAX_RATE = 0;
export const MAX_TAX_RATE = 0.5;

/** 8 gold per 10 s, paid on the 1 Hz economy tick, prevents a hard lock. */
export const PALACE_STIPEND = 8;
export const PALACE_STIPEND_PERIOD_TICKS = 100;

/** Cumulative tax revenue that promotes the palace to level 2. */
export const PALACE_L2_THRESHOLD = 3000;

/** Heroes bank personal gold above this when idle at their guild. */
export const HERO_BANK_THRESHOLD = 100;

/** Guild hero cap by palace level — §5. Index 0 is palace level 1. */
export const GUILD_CAP_BY_PALACE_LEVEL = [3, 5] as const;

/**
 * Effective loyalty falls as tax rises: loyalty x (1 - taxRate * 1.2). At the 50%
 * cap that is a 60% cut, and heroes stop defending your buildings. This is what
 * makes the slider a decision rather than a number to max out.
 */
export const TAX_LOYALTY_PENALTY = 1.2;

export function effectiveLoyalty(loyalty: number, taxRate: number): number {
  const scaled = loyalty * (1 - taxRate * TAX_LOYALTY_PENALTY);
  return scaled < 0 ? 0 : scaled;
}

// ── Flags — §8 ──────────────────────────────────────────────────────────────

/** At most 3 heroes may hold a given flag as their active target. */
export const FLAG_CLAIM_CAP = 3;

// ── Combat ──────────────────────────────────────────────────────────────────

/** Damage taken = max(MIN_DAMAGE, damage - armour) — §4.1. */
export const MIN_DAMAGE = 1;

/** Rogues take a premium on looted monster gold — §4.3. */
export const ROGUE_LOOT_BONUS = 0.6;

// ── Waves — §7 ──────────────────────────────────────────────────────────────

/** First lair spawn at t = 60 s. */
export const FIRST_SPAWN_TICK = 600;

// ── AI cadence — docs/02-architecture.md §7 ─────────────────────────────────

/** Goal scoring is round-robin over this many agents per tick. */
export const AGENTS_SCORED_PER_TICK = 8;
/** The currently active goal gets a 15% bonus, to stop dithering. */
export const INCUMBENCY_BONUS = 1.15;
/** Backward A* gives up after this many expansions. */
export const PLANNER_NODE_BUDGET = 150;
/** LRU plan cache capacity. */
export const PLAN_CACHE_CAPACITY = 512;
/** Hard replan ceiling: 5 s, staggered by agentId % 10. */
export const REPLAN_CEILING_TICKS = 50;
/** Pathfinding requests served per tick. */
export const PATH_BUDGET_PER_TICK = 20;

/** A hero idle longer than this is a bug the soak test should catch — §12. */
export const MAX_IDLE_TICKS = 600;
