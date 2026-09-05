import { describe, expect, test } from 'vitest';
import { World } from '../src/core/world';
import { GOLDEN_SEED } from './golden';

/**
 * The behavioural invariants tighten as systems land. At milestone 0 the contract is
 * narrow on purpose: the loop survives a long run and the bookkeeping stays sane.
 */
describe('soak', () => {
  test('5,000 ticks without a crash and with bounded treasury', () => {
    const w = new World(GOLDEN_SEED);
    for (let i = 0; i < 5_000; i++) {
      w.step();
      expect(Number.isFinite(w.treasury)).toBe(true);
      expect(w.treasury).toBeLessThan(50_000);
    }
    expect(w.tick).toBe(5_000);
  });

  test('entity slots are recycled rather than leaked', () => {
    const w = new World(GOLDEN_SEED);
    const handles = [];
    for (let i = 0; i < 200; i++) {
      handles.push(w.spawn({ kind: 'monster', faction: 'monsters', x: i, y: i }).handle);
    }
    for (const h of handles) w.kill(h);
    w.step();

    for (const h of handles) expect(w.get(h)).toBeNull(); // generation bumped
    expect(w.entitiesInIdOrder()).toHaveLength(0);

    const fresh = w.spawn({ kind: 'hero', faction: 'crown', x: 0, y: 0 });
    expect(fresh.handle.generation).toBeGreaterThan(0); // reused a slot
  });
});
