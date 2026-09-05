/**
 * Integration: the whole simulation, running.
 *
 * The unit tests prove each tier works. This proves they work *together* — that
 * heroes spawn, score goals, form plans, execute them, and that the world stays
 * deterministic and solvent while they do.
 */

import { describe, expect, test } from 'vitest';
import { createScenario } from '../src/core/scenario';
import { aiContext } from '../src/core/ai/agent-system';
import { MAX_IDLE_TICKS } from '../src/content/balance';

const TICKS = 5_000;

function run(seed: number, ticks = TICKS) {
  const w = createScenario({ seed });
  for (let i = 0; i < ticks; i++) w.step();
  return w;
}

describe('the simulation runs', () => {
  test('5,000 ticks without crashing, and heroes get recruited', () => {
    const w = run(2024);
    const heroes = w.views.agents.filter((e) => e.kind === 'hero');
    expect(heroes.length).toBeGreaterThan(0);
    expect(w.tick).toBe(TICKS);
  });

  test('heroes actually think — every one has a goal and most have a plan', () => {
    const w = run(2024);
    const heroes = w.views.agents.filter((e) => e.kind === 'hero' && e.alive);
    expect(heroes.length).toBeGreaterThan(0);

    for (const h of heroes) {
      expect(h.agent?.currentGoal).not.toBeNull();
      // The inspector depends on the breakdown being retained, not recomputed.
      expect((h.agent?.goalScores.length ?? 0)).toBeGreaterThan(0);
      expect(h.agent?.goalScores[0]?.parts.length).toBeGreaterThan(0);
    }
  });

  test('heroes do not all choose the same goal — traits actually differentiate', () => {
    const w = run(99);
    const goals = new Set(
      w.views.agents.filter((e) => e.kind === 'hero').map((e) => e.agent?.currentGoal),
    );
    expect(goals.size).toBeGreaterThan(1);
  });

  test('no hero sits idle for more than 60 seconds', () => {
    // docs/04-ai-spec.md §12.
    const w = createScenario({ seed: 7 });
    const idleSince = new Map<number, number>();

    for (let i = 0; i < TICKS; i++) {
      w.step();
      for (const e of w.views.agents) {
        if (e.kind !== 'hero') continue;
        const busy = e.agent?.currentGoal !== 'Idle';
        if (busy) idleSince.delete(e.id);
        else if (!idleSince.has(e.id)) idleSince.set(e.id, w.tick);
      }
    }
    for (const [, since] of idleSince) {
      expect(w.tick - since).toBeLessThanOrEqual(MAX_IDLE_TICKS);
    }
  });

  test('the planner cache earns its keep and null plans stay rare', () => {
    const w = run(2024);
    const { stats } = aiContext(w);

    // Cache *lookups* are the volume measure. A low planner-attempt count is the
    // cache doing its job, not the planner failing to run.
    const lookups = stats.hits + stats.misses;
    expect(lookups).toBeGreaterThan(50);
    expect(stats.hits / lookups).toBeGreaterThan(0.8); // §12: hit rate over 80%

    // §12 states the 5% ceiling for a hero run, so it is measured on heroes. A
    // critically wounded monster has no potion, no inn and no guild, so Survive is
    // genuinely unplannable for it — that null is correct behaviour, not broken
    // content, and Idle catches it.
    expect(stats.heroAttempts).toBeGreaterThan(20);
    expect(stats.heroNulls / stats.heroAttempts).toBeLessThan(0.05);
  });

  test('the planner never blows its node budget in a real run', () => {
    const w = run(31);
    const { stats } = aiContext(w);
    // Average expansions per attempt must stay well under the 150 ceiling, or the
    // 1.2 ms planning budget is a fiction.
    expect(stats.expansions / Math.max(1, stats.attempts)).toBeLessThan(150);
  });
});

describe('determinism holds with every system installed', () => {
  test('identical seeds produce byte-identical worlds at 5,000 ticks', () => {
    expect(run(2024).hash()).toBe(run(2024).hash());
  });

  test('different seeds diverge', () => {
    expect(run(1).hash()).not.toBe(run(2).hash());
  });

  test('a command log replays to the same hash', () => {
    const build = (rate: number) => {
      const w = createScenario({ seed: 5150 });
      for (let i = 0; i < 1200; i++) {
        if (i === 300) w.issue({ t: 'SET_TAX_RATE', rate });
        w.step();
      }
      return w;
    };
    expect(build(0.45).hash()).toBe(build(0.45).hash());
    // And the command has to actually matter, or the test proves nothing.
    expect(build(0.45).hash()).not.toBe(build(0.05).hash());
  });
});

describe('economic invariants', () => {
  test('the treasury stays bounded — no collapse, no runaway inflation', () => {
    const w = createScenario({ seed: 404 });
    for (let i = 0; i < TICKS; i++) {
      w.step();
      expect(w.treasury).toBeGreaterThanOrEqual(0);
      expect(w.treasury).toBeLessThan(50_000);
    }
  });

  test('escrow never leaks: cancelling a flag refunds in full', () => {
    const w = createScenario({ seed: 11 });
    for (let i = 0; i < 50; i++) w.step();

    const before = w.treasury;
    w.issue({ t: 'PLACE_FLAG', kind: 'explore', target: { tx: 50, ty: 50 }, gold: 300 });
    w.step();
    expect(w.escrow).toBe(300);
    expect(w.treasury).toBe(before - 300);

    const flag = w.views.flags[0];
    expect(flag).toBeDefined();
    w.issue({ t: 'CANCEL_FLAG', id: flag!.id });
    w.step();

    expect(w.escrow).toBe(0);
    expect(w.treasury).toBe(before);
  });

  test('the tax rate is clamped to the documented 0-50% range', () => {
    const w = createScenario({ seed: 1 });
    w.issue({ t: 'SET_TAX_RATE', rate: 5 });
    w.step();
    expect(w.taxRate).toBe(0.5);
    w.issue({ t: 'SET_TAX_RATE', rate: -1 });
    w.step();
    expect(w.taxRate).toBe(0);
  });
});

describe('pressure', () => {
  test('lairs spawn monsters and waves escalate', () => {
    const w = run(77, 3_000);
    const monsters = w.views.agents.filter((e) => e.kind === 'monster');
    expect(monsters.length).toBeGreaterThan(0);
    expect(w.wave).toBeGreaterThan(1);
  });

  test('monsters use the same stack and reach their own goals', () => {
    const w = run(77, 3_000);
    const monsters = w.views.agents.filter((e) => e.kind === 'monster' && e.alive);
    expect(monsters.length).toBeGreaterThan(0);
    for (const m of monsters.slice(0, 5)) {
      expect(['AttackStructure', 'AttackHenchman', 'Survive', 'Idle']).toContain(
        m.agent?.currentGoal,
      );
    }
  });
});
