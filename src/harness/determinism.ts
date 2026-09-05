/**
 * Cross-engine determinism harness — docs/03-determinism.md §5.3.
 *
 * The same simulation, compiled into a browser bundle, so Playwright can run it on
 * Chromium, Firefox and WebKit and compare the hash against Node. All four must
 * agree. This is the test that would catch a transcendental function slipping into
 * core: V8, SpiderMonkey and JavaScriptCore implement them differently, and one
 * differing bit diverges the whole run.
 */

import { createScenario } from '../core/scenario';
import { GOLDEN_SEED, GOLDEN_TICKS } from './golden';

export interface HarnessResult {
  seed: number;
  ticks: number;
  hash: number;
  /** Sampled along the way, so a divergence can be bisected to a tick range. */
  checkpoints: { tick: number; hash: number }[];
  engine: string;
}

export function runHarness(seed = GOLDEN_SEED, ticks = GOLDEN_TICKS): HarnessResult {
  const w = createScenario({ seed });
  const checkpoints: { tick: number; hash: number }[] = [];
  const every = Math.max(1, Math.floor(ticks / 10));

  for (let i = 0; i < ticks; i++) {
    w.step();
    if (w.tick % every === 0) checkpoints.push({ tick: w.tick, hash: w.hash() });
  }

  return {
    seed,
    ticks,
    hash: w.hash(),
    checkpoints,
    engine: typeof navigator === 'undefined' ? 'node' : navigator.userAgent,
  };
}
