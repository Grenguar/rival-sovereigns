/**
 * The three tiers, wired into the tick loop. Phases 3, 4 and 5.
 *
 * Tier 1 asks "what do I want?" about once a second, staggered.
 * Tier 2 asks "how do I get it?" only on a goal change or an invalidation.
 * Tier 3 does the next step, every tick.
 *
 * Staggering is the primary performance lever (docs/02-architecture.md §7): no system
 * costing more than ~10 µs per agent may run for every agent every tick.
 */

import { S, type Agent, type GoalId, type PlannerStats, type Plan, type WorldView } from '../types';
import type { World } from '../world';
import { TICKS_PER_SECOND, type SystemFn } from '../world';
import { ACTIONS, ACTIONS_BY_ID } from './goap/actions';
import { PlanCache, planKey } from './goap/cache';
import { plan as runPlanner, emptyPlannerStats } from './goap/planner';
import { goalsFor } from './goals';
import { scoreAll } from './utility';
import { computeCurrentState } from './sensors';
import { REPLAN_CEILING_TICKS } from '../../content/balance';
import {
  defendTarget,
  henchmanTarget,
  huntTarget,
  nearestOf,
  structureTarget,
} from './targeting';

/** Goals are re-scored on this period, offset per agent so the cost spreads. */
export const GOAL_PERIOD = TICKS_PER_SECOND; // ~1 s
/** How many rival goals the inspector keeps beyond the winner. */
const RIVALS_KEPT = 4;
const HISTORY_LIMIT = 10;

export interface AiContext {
  cache: PlanCache;
  stats: PlannerStats;
}

const KEY = 'ai';

export function aiContext(w: World): AiContext {
  let ctx = w.systemState.get(KEY) as AiContext | undefined;
  if (ctx === undefined) {
    const stats = emptyPlannerStats();
    ctx = { stats, cache: new PlanCache(undefined, stats) };
    w.systemState.set(KEY, ctx);
  }
  return ctx;
}

// ── target binding ──────────────────────────────────────────────────────────

/**
 * Resolves the concrete thing a goal is about onto the blackboard.
 *
 * The planning space is boolean; *which* monster and *which* flag live here. Doing it
 * at goal-selection time rather than inside the planner is what keeps the search
 * space small enough to fit the node budget.
 */
export function bindGoalTarget(a: Agent, w: WorldView, goalId: GoalId): void {
  const bb = a.blackboard;

  switch (goalId) {
    case 'Survive':
      bb.currentTarget = bb.nearestThreat;
      return;
    case 'HuntMonster':
      bb.currentTarget = huntTarget(a, w);
      return;
    case 'DefendHome':
      bb.currentTarget = defendTarget(a, w);
      return;
    case 'AttackStructure':
      bb.currentTarget = structureTarget(a, w);
      return;
    case 'AttackHenchman':
      bb.currentTarget = henchmanTarget(a, w);
      return;
    case 'ClaimBounty': {
      const flag = bb.knownFlags[0];
      if (flag === undefined) return;
      const target = nearestOf(a, w, (e) => e.id === flag.id);
      if (target.index >= 0) bb.currentTarget = target;
      return;
    }
    default:
      return;
  }
}

// ── tier 1 — goal selection (phase 3) ───────────────────────────────────────

function recordSwitch(a: Agent, w: World, to: GoalId, trigger: 'stagger' | 'interrupt'): void {
  a.history.push({ tick: w.tick, from: a.currentGoal, to, trigger });
  if (a.history.length > HISTORY_LIMIT) a.history.shift();
}

export const goalSelectionSystem: SystemFn = (w) => {
  for (const e of w.views.agents) {
    const a = e.agent;
    if (a === undefined) continue;
    if (w.tick < a.nextGoalTick) continue;

    const interrupt = a.nextGoalTick <= w.tick && a.currentGoal !== null && a.plan !== null;
    const scored = scoreAll(goalsFor(a.classId), a, w);
    a.goalScores = scored.slice(0, RIVALS_KEPT);

    const winner = scored[0];
    // Offset by id so eighty agents do not all re-score on the same tick.
    a.nextGoalTick = w.tick + GOAL_PERIOD;

    if (winner === undefined) continue;
    if (winner.goalId !== a.currentGoal) {
      recordSwitch(a, w, winner.goalId, interrupt ? 'interrupt' : 'stagger');
      a.currentGoal = winner.goalId;
      a.plan = null; // a new goal invalidates the plan by definition
    }
    bindGoalTarget(a, w, winner.goalId);
    // Sensors computed currentState in phase 2, before this binding existed. Without
    // refreshing it the planner sees a stale TARGET_KNOWN, cannot chain MoveToTarget
    // into Attack, and returns null for every hunt — a 16% null-plan rate.
    a.currentState = computeCurrentState(a, w);
  }
};

// ── tier 2 — planning (phase 4) ─────────────────────────────────────────────

/** Never on a timer alone — docs/04-ai-spec.md §6. */
function needsReplan(a: Agent, w: World): boolean {
  if (a.currentGoal === null) return false;
  const p = a.plan;
  if (p === null) return true;
  if (p.goalId !== a.currentGoal) return true;
  if (p.index >= p.steps.length) return true;
  // A symbol the plan depends on flipped underneath it — §6 replan trigger 2.
  if ((a.currentState.values & p.accumulatedMask) !== p.maskedValues) return true;
  // Hard ceiling, staggered by agent id.
  const self = w.get(a.entity);
  const stagger = self === null ? 0 : self.id % 10;
  return w.tick - p.createdTick > REPLAN_CEILING_TICKS + stagger;
}

export const planningSystem: SystemFn = (w) => {
  const { cache, stats } = aiContext(w);

  for (const e of w.views.agents) {
    const a = e.agent;
    if (a === undefined || a.currentGoal === null) continue;
    if (!needsReplan(a, w)) continue;

    // Try the winner, then fall back down the ranking. Idle is always satisfiable,
    // so this loop cannot leave the agent without a plan.
    const candidates = a.goalScores.length > 0 ? a.goalScores : [];
    let made: Plan | null = null;

    for (const candidate of candidates) {
      // A goal scoring zero is one the agent has no reason and usually no means to
      // pursue — HuntMonster with nothing to hunt, Upgrade with nothing affordable.
      // Planning it burns the node budget to return null. Idle's 0.05 floor
      // guarantees there is always a candidate left.
      if (candidate.score <= 0) continue;
      const goal = goalsFor(a.classId).find((g) => g.id === candidate.goalId);
      if (goal === undefined) continue;

      // Re-resolve the target against the world as it is *now*.
      //
      // goalScores can be up to a second old, and a monster that was alive when the
      // goal was scored is very often dead by the time we plan for it. Planning a
      // kill-goal against a corpse is unsatisfiable, and it was the single largest
      // source of null plans in the soak run.
      bindGoalTarget(a, w, goal.id);
      a.currentState = computeCurrentState(a, w);

      const needsTarget = (goal.target.mask & S.TARGET_DEAD) !== 0;
      if (needsTarget && !w.isAlive(a.blackboard.currentTarget)) continue;

      const key = planKey(goal.id, a.currentState, a.classId);
      let result = cache.get(key);
      if (result === undefined) {
        result = runPlanner(a, goal.target, ACTIONS, w, { stats });
        cache.set(key, result);

        const isHero = e.kind === 'hero';
        if (isHero) stats.heroAttempts++;
        if (result === null) {
          stats.nullsByGoal[goal.id] = (stats.nullsByGoal[goal.id] ?? 0) + 1;
          if (isHero) stats.heroNulls++;
        }
      }
      if (result === null) continue;

      if (candidate.goalId !== a.currentGoal) {
        a.currentGoal = candidate.goalId;
        bindGoalTarget(a, w, candidate.goalId);
      }
      made = {
        goalId: candidate.goalId,
        steps: result.steps.map((s) => ({ ...s })),
        index: 0,
        startedIndex: -1,
        accumulatedMask: result.accumulatedMask,
        maskedValues: a.currentState.values & result.accumulatedMask,
        totalCost: result.totalCost,
        createdTick: w.tick,
      };
      break;
    }

    a.plan = made;
  }
};

// ── tier 3 — execution (phase 5) ────────────────────────────────────────────

export const actionSystem: SystemFn = (w) => {
  for (const e of w.views.agents) {
    const a = e.agent;
    if (a === undefined) continue;
    const p = a.plan;
    if (p === null) continue;

    const step = p.steps[p.index];
    if (step === undefined) {
      a.plan = null;
      continue;
    }

    const def = ACTIONS_BY_ID.get(step.action);
    if (def === undefined) {
      a.plan = null;
      continue;
    }

    // stillValid() first, then tick() — §7. A failed action is ordinary, not
    // exceptional: the target moved, the shop is gone, the path is blocked.
    if (!def.runtime.stillValid(a, w)) {
      def.runtime.abort(a, w);
      a.plan = null;
      a.nextGoalTick = w.tick; // re-score immediately rather than waiting
      continue;
    }

    if (p.startedIndex !== p.index) {
      def.bind(a, w);
      def.runtime.start(a, w);
      p.startedIndex = p.index;
    }

    const result = def.runtime.tick(a, w);
    if (result === 'running') continue;

    if (result === 'failure') {
      def.runtime.abort(a, w);
      a.plan = null;
      a.nextGoalTick = w.tick;
      continue;
    }

    p.index++;
    if (p.index >= p.steps.length) {
      a.plan = null; // goal reached; tier 1 picks the next one
      a.nextGoalTick = w.tick;
    }
  }
};

/** Registers tiers 1–3 into the fixed tick order. */
export function installAi(w: World): void {
  w.hooks.goalSelection.push(goalSelectionSystem);
  w.hooks.planning.push(planningSystem);
  w.hooks.actions.push(actionSystem);
}
