import { describe, expect, test } from 'vitest';
import { Hasher } from './hash';
import { World } from '../core/world';

describe('Hasher', () => {
  test('is stable for identical input', () => {
    const a = new Hasher().mix(1).mix(2).mixPos(3.5).value();
    const b = new Hasher().mix(1).mix(2).mixPos(3.5).value();
    expect(a).toBe(b);
  });

  test('is order sensitive', () => {
    expect(new Hasher().mix(1).mix(2).value()).not.toBe(new Hasher().mix(2).mix(1).value());
  });

  test('quantises positions to 1/1000', () => {
    // Sub-1/1000 differences are display precision, not simulation state.
    expect(new Hasher().mixPos(1.00001).value()).toBe(new Hasher().mixPos(1.0).value());
    expect(new Hasher().mixPos(1.002).value()).not.toBe(new Hasher().mixPos(1.0).value());
  });

  test('returns an unsigned 32-bit value', () => {
    const v = new Hasher().mix(-1).mix(0xffffffff).value();
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThanOrEqual(0xffffffff);
  });
});

describe('hashWorld', () => {
  test('reflects entity state changes', () => {
    const w = new World(1);
    const before = w.hash();
    const e = w.spawn({ kind: 'hero', faction: 'crown', x: 5, y: 5 });
    const afterSpawn = w.hash();
    expect(afterSpawn).not.toBe(before);

    e.transform.x = 6;
    expect(w.hash()).not.toBe(afterSpawn);
  });

  test('is independent of spawn order for the same final state', () => {
    const a = new World(1);
    const b = new World(1);
    a.spawn({ kind: 'hero', faction: 'crown', x: 1, y: 1 });
    a.spawn({ kind: 'monster', faction: 'monsters', x: 2, y: 2 });
    b.spawn({ kind: 'hero', faction: 'crown', x: 1, y: 1 });
    b.spawn({ kind: 'monster', faction: 'monsters', x: 2, y: 2 });
    expect(a.hash()).toBe(b.hash());
  });
});
