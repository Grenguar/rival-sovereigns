/**
 * Regression guard on tick cost — docs/02-architecture.md §7.
 *
 * The budget is 80 agents at 10 Hz in under 5 ms per tick on a 2021 mid-range
 * laptop. This asserts a deliberately loose multiple of that: the point is to catch
 * an order-of-magnitude regression (an un-staggered system, a cache that stopped
 * working), not to fail on a noisy CI box.
 *
 * performance.now is legal here — tests are outside src/core.
 */

import { describe, expect, test } from 'vitest';
import { createScenario } from '../src/core/scenario';
import { aiContext } from '../src/core/ai/agent-system';
import { createMonster } from '../src/core/factory';

const BUDGET_MS = 5;
/** Generous headroom so this fails on regressions, not on a busy machine. */
const CEILING_MS = BUDGET_MS * 4;

function benchmark(agentTarget: number, ticks: number) {
  const w = createScenario({ seed: 1234 });

  // Warm the world up, then top it up to the target agent count.
  for (let i = 0; i < 1_200; i++) w.step();
  let guard = 0;
  while (w.views.agents.length < agentTarget && guard++ < 500) {
    createMonster(w, 'ratkin', { tx: 30 + (guard % 40), ty: 30 + ((guard * 7) % 40) });
  }

  // Counted before the measured window, not after: heroes kill monsters during the
  // run, so an end-of-run count reports a population the benchmark never had.
  const agents = w.views.agents.length;

  const started = performance.now();
  for (let i = 0; i < ticks; i++) w.step();
  const elapsed = performance.now() - started;

  return { w, msPerTick: elapsed / ticks, agents };
}

describe('performance', () => {
  test('80 agents stay well inside the per-tick budget', () => {
    const { msPerTick, agents } = benchmark(80, 1_000);
    console.log(`perf: ${agents} agents, ${msPerTick.toFixed(3)} ms/tick (budget ${BUDGET_MS} ms)`);
    expect(agents).toBeGreaterThanOrEqual(60);
    expect(msPerTick).toBeLessThan(CEILING_MS);
  });

  test('the plan cache is what keeps planning affordable', () => {
    const { w } = benchmark(80, 500);
    const { stats } = aiContext(w);
    const lookups = stats.hits + stats.misses;
    expect(lookups).toBeGreaterThan(100);
    // A collapsing hit rate is the first sign of a performance problem — §6.
    expect(stats.hits / lookups).toBeGreaterThan(0.8);
  });

  test('cost scales sub-linearly with agent count, proving the stagger works', () => {
    const small = benchmark(20, 600);
    const large = benchmark(80, 600);
    // Four times the agents must not cost four times as much, or something is
    // running for every agent every tick.
    expect(large.msPerTick).toBeLessThan(small.msPerTick * 4);
  });
});
