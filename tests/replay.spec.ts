import { describe, expect, test } from 'vitest';
import { World, replay } from '../src/core/world';
import { hashWorld } from '../src/core/hash';
import { GOLDEN_COMMAND_LOG, GOLDEN_SEED } from './golden';

const TICKS = 10_000;

describe('determinism', () => {
  test('identical seeds produce identical worlds', () => {
    const a = new World(GOLDEN_SEED);
    const b = new World(GOLDEN_SEED);
    for (let i = 0; i < TICKS; i++) {
      a.step();
      b.step();
    }
    expect(hashWorld(a)).toBe(hashWorld(b));
  });

  test('identical seeds and identical command logs agree', () => {
    const a = new World(GOLDEN_SEED);
    const b = new World(GOLDEN_SEED);
    replay(a, GOLDEN_COMMAND_LOG, TICKS);
    replay(b, GOLDEN_COMMAND_LOG, TICKS);
    expect(hashWorld(a)).toBe(hashWorld(b));
    expect(a.commandLog).toEqual(b.commandLog);
  });

  test('different seeds diverge', () => {
    const a = new World(GOLDEN_SEED);
    const b = new World(GOLDEN_SEED + 1);
    for (let i = 0; i < 100; i++) {
      a.rng.nextU32();
      b.rng.nextU32();
      a.step();
      b.step();
    }
    expect(hashWorld(a)).not.toBe(hashWorld(b));
  });

  test('the hash is stable across repeated calls', () => {
    const w = new World(GOLDEN_SEED);
    for (let i = 0; i < 500; i++) w.step();
    expect(hashWorld(w)).toBe(hashWorld(w));
  });
});
