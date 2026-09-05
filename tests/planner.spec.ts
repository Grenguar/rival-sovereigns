/**
 * Property tests for the GOAP planner — docs/06-testing.md §3.
 *
 * The planner's contract: any plan it returns must actually reach the goal. This
 * catches precondition/effect mistakes in *content*, which is where they happen.
 * Every action added to the action set is covered automatically.
 */

import { describe, expect, test } from 'vitest';
import { World } from '../src/core/world';
import { Rng } from '../src/core/rng';
import { S } from '../src/core/types';
import type { State } from '../src/core/types';
import { plan, emptyPlannerStats } from '../src/core/ai/goap/planner';
import { ACTIONS, ACTIONS_BY_ID } from '../src/core/ai/goap/actions';
import { apply, satisfies, popcount, regress, requireAll, requireNone } from '../src/core/ai/goap/state';
import { PLANNER_NODE_BUDGET } from '../src/content/balance';
import { makeHero } from './fixtures';

const ALL_SYMBOLS = [
  S.HAS_GOLD, S.AT_TARGET, S.TARGET_DEAD, S.TARGET_KNOWN, S.IS_INJURED,
  S.IS_CRITICAL, S.HAS_POTION, S.AT_MARKET, S.AT_SMITH, S.AT_INN,
  S.AT_HOME_GUILD, S.THREAT_NEARBY, S.BOUNTY_KNOWN, S.LAIR_KNOWN,
  S.UPGRADE_AVAILABLE, S.IS_RESTED, S.SAFE,
];

/** A random state constraining a random subset of symbols. */
function randomState(rng: Rng, maxSymbols = 4): State {
  let mask = 0;
  let values = 0;
  const count = rng.nextInt(1, maxSymbols + 1);
  for (let i = 0; i < count; i++) {
    const bit = ALL_SYMBOLS[rng.nextInt(0, ALL_SYMBOLS.length)] as number;
    mask |= bit;
    if (rng.nextInt(0, 2) === 1) values |= bit;
  }
  return { values, mask };
}

describe('planner property: every returned plan reaches its goal', () => {
  test('1,000 random start/goal pairs', () => {
    const rng = new Rng(1234);
    const world = new World(1);
    const { agent } = makeHero(world, 'rogue');

    let planned = 0;

    for (let i = 0; i < 1000; i++) {
      const start = randomState(rng);
      const goal = randomState(rng);
      agent.currentState = start;

      const result = plan(agent, goal, ACTIONS, world);
      if (result === null) continue; // null is legal
      planned++;

      // Replay the plan forward from the start state.
      let s = start;
      for (const step of result.steps) {
        const def = ACTIONS_BY_ID.get(step.action);
        expect(def).toBeDefined();
        // The precondition must hold at the moment the step runs.
        expect(satisfies(s, def!.pre)).toBe(true);
        s = apply(s, def!.eff);
      }
      expect(satisfies(s, goal)).toBe(true);
    }

    // A test where nothing ever plans would pass vacuously.
    expect(planned).toBeGreaterThan(100);
  });

  test('node expansions never exceed the budget', () => {
    const rng = new Rng(99);
    const world = new World(1);
    const { agent } = makeHero(world, 'warrior');

    for (let i = 0; i < 300; i++) {
      agent.currentState = randomState(rng);
      const result = plan(agent, randomState(rng), ACTIONS, world);
      if (result !== null) expect(result.expansions).toBeLessThanOrEqual(PLANNER_NODE_BUDGET);
    }
  });

  test("a returned plan's cost equals the sum of its steps", () => {
    const rng = new Rng(7);
    const world = new World(1);
    const { agent } = makeHero(world, 'ranger');

    for (let i = 0; i < 200; i++) {
      agent.currentState = randomState(rng);
      const result = plan(agent, randomState(rng), ACTIONS, world);
      if (result === null) continue;
      const summed = result.steps.reduce((acc, s) => acc + s.cost, 0);
      expect(summed).toBeCloseTo(result.totalCost, 6);
    }
  });

  test('planning is deterministic for identical input', () => {
    const rng = new Rng(4242);
    const world = new World(1);
    const { agent } = makeHero(world, 'rogue');

    for (let i = 0; i < 200; i++) {
      const start = randomState(rng);
      const goal = randomState(rng);

      agent.currentState = start;
      const a = plan(agent, goal, ACTIONS, world);
      agent.currentState = start;
      const b = plan(agent, goal, ACTIONS, world);

      expect(a === null).toBe(b === null);
      if (a !== null && b !== null) {
        expect(a.steps.map((s) => s.action)).toEqual(b.steps.map((s) => s.action));
        expect(a.totalCost).toBeCloseTo(b.totalCost, 9);
      }
    }
  });
});

describe('planner behaviour', () => {
  test('an already-satisfied goal produces an empty plan', () => {
    const world = new World(1);
    const { agent } = makeHero(world);
    agent.currentState = requireAll(S.SAFE);
    const result = plan(agent, requireAll(S.SAFE), ACTIONS, world);
    expect(result?.steps).toEqual([]);
  });

  test('Idle is always reachable, so SAFE never strands an agent', () => {
    const world = new World(1);
    const { agent } = makeHero(world);
    agent.currentState = requireNone(S.SAFE);
    const result = plan(agent, requireAll(S.SAFE), ACTIONS, world);
    expect(result).not.toBeNull();
  });

  test('class gating keeps LootCorpse out of a warrior plan', () => {
    const world = new World(1);
    const warrior = makeHero(world, 'warrior');
    warrior.agent.currentState = requireAll(S.AT_TARGET, S.TARGET_DEAD);

    const result = plan(warrior.agent, requireAll(S.HAS_GOLD), ACTIONS, world);
    if (result !== null) {
      expect(result.steps.map((s) => s.action)).not.toContain('LootCorpse');
    }
  });

  test('stats record attempts, and null plans separately from misses', () => {
    const world = new World(1);
    const { agent } = makeHero(world);
    const stats = emptyPlannerStats();

    agent.currentState = requireAll(S.SAFE);
    plan(agent, requireAll(S.SAFE), ACTIONS, world, { stats });
    expect(stats.attempts).toBe(1);

    // A budget of 1 cannot expand anything, so this must come back null.
    plan(agent, requireAll(S.TARGET_DEAD), ACTIONS, world, { stats, budget: 0 });
    expect(stats.attempts).toBe(2);
    expect(stats.nullPlans).toBe(1);
  });
});

describe('state algebra', () => {
  test('satisfies ignores symbols the goal does not constrain', () => {
    const cur = { values: S.SAFE | S.HAS_GOLD, mask: S.SAFE | S.HAS_GOLD };
    expect(satisfies(cur, requireAll(S.SAFE))).toBe(true);
    expect(satisfies(cur, requireNone(S.SAFE))).toBe(false);
  });

  test('regress removes what the action provides and adds what it requires', () => {
    const goal = requireAll(S.AT_TARGET);
    const move = ACTIONS_BY_ID.get('MoveToTarget')!;
    const back = regress(goal, move.pre, move.eff);
    // After regressing through MoveToTarget we need TARGET_KNOWN, not AT_TARGET.
    expect(back.mask & S.TARGET_KNOWN).toBeTruthy();
    expect(back.mask & S.AT_TARGET).toBeFalsy();
  });

  test('popcount matches a naive bit count', () => {
    for (const v of [0, 1, 0b1011, 0xffff, 0x7fffffff]) {
      let naive = 0;
      for (let i = 0; i < 32; i++) if ((v >>> i) & 1) naive++;
      expect(popcount(v)).toBe(naive);
    }
  });

  test('every action declares at least one effect, or the planner cannot use it', () => {
    for (const action of ACTIONS) {
      expect(action.eff.mask).not.toBe(0);
    }
  });
});
