/**
 * Balance by simulation, not by playing — docs/01-game-design.md §11.
 *
 * Sweeps configurations headlessly and asserts the economy stays inside its designed
 * envelope. A configuration that fails these is a balance bug with a reproducible
 * seed attached, which is the entire point of the determinism work.
 *
 * The full 45-configuration sweep at 20,000 ticks is the nightly job (§1 of
 * docs/06-testing.md says this is the one test allowed to be slow). The default run
 * is a representative subset so the every-commit suite stays under 30 seconds; set
 * SWEEP=full for the whole grid.
 */

import { describe, expect, test } from 'vitest';
import { createScenario } from '../src/core/scenario';
import { PROGRESSION } from '../src/content/balance';

const FULL = process.env.SWEEP === 'full';

const TAX_RATES = FULL ? [0, 0.1, 0.2, 0.3, 0.4, 0.5] : [0, 0.2, 0.5];
const BOUNTIES = FULL ? [0, 150, 300, 500, 800] : [0, 400];
const SEEDS = FULL ? [1, 2, 3] : [7];
const TICKS = FULL ? 20_000 : 6_000;

interface Outcome {
  taxRate: number;
  bounty: number;
  seed: number;
  minTreasury: number;
  maxTreasury: number;
  bestLevel: number;
  heroesEver: number;
  endedTick: number | null;
}

function sweep(taxRate: number, bounty: number, seed: number): Outcome {
  const w = createScenario({ seed, taxRate });
  let minTreasury = Number.POSITIVE_INFINITY;
  let maxTreasury = 0;
  let bestLevel = 1;
  const heroesEver = new Set<number>();
  let endedTick: number | null = null;

  for (let i = 0; i < TICKS; i++) {
    if (bounty > 0 && i === 600) {
      w.issue({ t: 'PLACE_FLAG', kind: 'attack', target: { tx: 58, ty: 36 }, gold: bounty });
    }
    w.step();

    if (w.treasury < minTreasury) minTreasury = w.treasury;
    if (w.treasury > maxTreasury) maxTreasury = w.treasury;
    for (const e of w.views.agents) {
      if (e.kind !== 'hero') continue;
      heroesEver.add(e.id);
      const lvl = e.progression?.level ?? 1;
      if (lvl > bestLevel) bestLevel = lvl;
    }
    if (endedTick === null && w.outcome !== 'playing') endedTick = w.tick;
  }

  return { taxRate, bounty, seed, minTreasury, maxTreasury, bestLevel, heroesEver: heroesEver.size, endedTick };
}

const CONFIGS = TAX_RATES.flatMap((t) => BOUNTIES.flatMap((b) => SEEDS.map((s) => [t, b, s] as const)));

describe('economy sweep', () => {
  const results = CONFIGS.map(([t, b, s]) => sweep(t, b, s));

  test('every configuration recruits heroes', () => {
    for (const r of results) {
      expect(r.heroesEver, `tax=${r.taxRate} bounty=${r.bounty} seed=${r.seed}`).toBeGreaterThan(0);
    }
  });

  test('the treasury never goes negative', () => {
    for (const r of results) {
      expect(r.minTreasury, `tax=${r.taxRate} bounty=${r.bounty}`).toBeGreaterThanOrEqual(0);
    }
  });

  test('no runaway inflation past 50,000', () => {
    for (const r of results) {
      expect(r.maxTreasury, `tax=${r.taxRate} bounty=${r.bounty}`).toBeLessThan(50_000);
    }
  });

  test('no configuration resolves in under five minutes of play', () => {
    // 5 minutes at 10 Hz. A mission that ends this fast is not a mission.
    for (const r of results) {
      if (r.endedTick !== null) {
        expect(r.endedTick, `tax=${r.taxRate} bounty=${r.bounty}`).toBeGreaterThan(3_000);
      }
    }
  });

  test('heroes make progress — someone levels up', () => {
    expect(Math.max(...results.map((r) => r.bestLevel))).toBeGreaterThan(1);
  });

  test('the level table is the ceiling on progression', () => {
    for (const r of results) expect(r.bestLevel).toBeLessThanOrEqual(PROGRESSION.length);
  });

  test('a bounty changes the run — the flag is not decorative', () => {
    // Same seed and tax, different bounty, must diverge. If it does not, either the
    // escrow never left the treasury or no hero ever reacted to the flag.
    const withBounty = createScenario({ seed: 4242 });
    const without = createScenario({ seed: 4242 });
    for (let i = 0; i < 2_000; i++) {
      if (i === 600) {
        withBounty.issue({ t: 'PLACE_FLAG', kind: 'attack', target: { tx: 58, ty: 36 }, gold: 500 });
      }
      withBounty.step();
      without.step();
    }
    expect(withBounty.hash()).not.toBe(without.hash());
  });
});
