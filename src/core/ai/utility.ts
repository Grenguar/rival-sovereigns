/**
 * A7 — tier 1 goal selection. docs/04-ai-spec.md §5.
 *
 * The question a hero asks most often is *is that bounty worth the risk, to me?* That
 * is a scoring problem, not a search problem. Encoding greed and cowardice into
 * action costs would make them nearly impossible to tune or explain; utility answers
 * it natively and produces a breakdown the Hero Inspector can display.
 *
 * Only + - * here. No exponents — every response shape comes from a generated LUT.
 */

import type { Agent, GoalDef, ScoreBreakdown, WorldView } from '../types';
import { INCUMBENCY_BONUS } from '../../content/balance';
import { curve, traitCurve } from './curves';

/** The top of the documented trait range — docs/01-game-design.md §4.2. */
const TRAIT_MAX = 1.8;

/**
 * Scores one goal.
 *
 * The product of considerations is the base: any single veto (a consideration
 * returning ~0) kills the goal, which is the behaviour we want. But a bare product
 * systematically punishes goals that happen to have more considerations, so the
 * compensation term lifts it back toward 1 in proportion to how many there are. This
 * is the standard Dave Mark compensation and it is why a 4-consideration goal can
 * still compete with a 2-consideration one.
 */
export function scoreGoal(g: GoalDef, a: Agent, w: WorldView): ScoreBreakdown {
  const parts: number[] = [];
  let product = 1;

  for (const c of g.considerations) {
    const raw = c.input(a, w);
    let v: number;
    if (c.trait === undefined) {
      v = curve(c.family.NEUTRAL, raw);
    } else {
      const t = a.traits[c.trait];
      // See Consideration.traitInverted — Survive is the one goal where a higher
      // trait must weaken the response rather than strengthen it.
      v = traitCurve(c.family, c.traitInverted === true ? TRAIT_MAX - t : t, raw);
    }
    parts.push(v);
    product = product * v;
  }

  const n = g.considerations.length;
  // A goal with no considerations is a constant; there is nothing to compensate for.
  let score = product;
  if (n > 1) {
    const mod = 1 - 1 / n;
    score = product + (1 - product) * mod * product;
  }

  score = score * (g.classMultiplier[a.classId] ?? 0);

  // Incumbency stops a hero dithering between two near-equal goals every second.
  if (a.currentGoal === g.id) score = score * INCUMBENCY_BONUS;

  return { goalId: g.id, score, parts };
}

/**
 * Scores every goal available to this agent, highest first.
 *
 * Ties break by goal id so the ordering is total and stable — two engines must agree
 * on the winner, and `Array.prototype.sort` is only stable with respect to the
 * comparator it is given.
 */
export function scoreAll(goals: readonly GoalDef[], a: Agent, w: WorldView): ScoreBreakdown[] {
  const scored: ScoreBreakdown[] = [];
  for (const g of goals) {
    // A goal with no multiplier for this kind is simply unavailable to it.
    if ((g.classMultiplier[a.classId] ?? 0) === 0) continue;
    scored.push(scoreGoal(g, a, w));
  }
  scored.sort((x, y) => (y.score !== x.score ? y.score - x.score : x.goalId < y.goalId ? -1 : 1));
  return scored;
}

/** The winner, or null if the agent has no goal available at all. */
export function selectGoal(
  goals: readonly GoalDef[],
  a: Agent,
  w: WorldView,
): ScoreBreakdown | null {
  const scored = scoreAll(goals, a, w);
  return scored.length === 0 ? null : (scored[0] as ScoreBreakdown);
}

// ── Normalised consideration inputs ─────────────────────────────────────────
// Every consideration must hand the curve a 0..1 value. These are the shared
// normalisers, kept here so a goal definition stays declarative.

/** Clamps to 0..1. */
export const norm01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Maps a value against a soft ceiling: 0 at 0, approaching 1 at `ceiling`. */
export const ratio = (v: number, ceiling: number): number =>
  ceiling <= 0 ? 0 : norm01(v / ceiling);

/**
 * Distance normalised against a horizon, in *squared* tile units.
 *
 * Squared throughout — docs/03-determinism.md §4.2. Calling sqrt here would be safe
 * arithmetically but pointless: the curve is tuned against whatever shape it is fed,
 * and skipping the sqrt keeps eighty agents cheaper.
 */
export function normalisedDistanceSq(dx: number, dy: number, horizon: number): number {
  const d2 = dx * dx + dy * dy;
  const h2 = horizon * horizon;
  return h2 <= 0 ? 1 : norm01(d2 / h2);
}
