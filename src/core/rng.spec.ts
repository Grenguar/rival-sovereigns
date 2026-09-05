import { describe, expect, test } from 'vitest';
import { Rng } from './rng';

describe('Rng', () => {
  test('same seed produces the same 10,000-number sequence', () => {
    const a = new Rng(12345);
    const b = new Rng(12345);
    for (let i = 0; i < 10_000; i++) expect(a.nextU32()).toBe(b.nextU32());
  });

  test('different seeds diverge immediately', () => {
    const a = new Rng(1);
    const b = new Rng(2);
    expect(a.nextU32()).not.toBe(b.nextU32());
  });

  test('nextU32 stays inside the unsigned 32-bit range', () => {
    const r = new Rng(99);
    for (let i = 0; i < 5_000; i++) {
      const v = r.nextU32();
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(0xffffffff);
    }
  });

  test('nextFloat is in [0, 1)', () => {
    const r = new Rng(7);
    for (let i = 0; i < 5_000; i++) {
      const v = r.nextFloat();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  test('nextInt is in [min, max) and covers the range', () => {
    const r = new Rng(31337);
    const seen = new Set<number>();
    for (let i = 0; i < 5_000; i++) {
      const v = r.nextInt(3, 9);
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThan(9);
      seen.add(v);
    }
    expect(seen.size).toBe(6);
  });

  test('a zero seed still produces a live stream', () => {
    const r = new Rng(0);
    const values = new Set<number>();
    for (let i = 0; i < 100; i++) values.add(r.nextU32());
    expect(values.size).toBeGreaterThan(90);
  });

  test('save and load round-trips the stream', () => {
    const r = new Rng(555);
    for (let i = 0; i < 100; i++) r.nextU32();
    const state = r.saveState();
    const expected = [r.nextU32(), r.nextU32(), r.nextU32()];

    r.loadState(state);
    expect([r.nextU32(), r.nextU32(), r.nextU32()]).toEqual(expected);
  });

  test('snapshot changes as the stream advances and matches for equal states', () => {
    const a = new Rng(88);
    const b = new Rng(88);
    const before = a.snapshot();
    a.nextU32();
    expect(a.snapshot()).not.toBe(before);
    b.nextU32();
    expect(a.snapshot()).toBe(b.snapshot());
  });

  test('shuffle depends only on the stream', () => {
    const a = new Rng(4).shuffle([1, 2, 3, 4, 5, 6, 7, 8]);
    const b = new Rng(4).shuffle([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(a).toEqual(b);
    expect([...a].sort((x, y) => x - y)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });
});
