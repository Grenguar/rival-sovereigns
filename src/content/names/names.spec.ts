import { describe, expect, test } from 'vitest';
import { Rng } from '../../core/rng';
import { CLASS_IDS } from '../classes';
import { NAMES_BY_CLASS, NAMES_PER_CLASS, nameAt, pickName } from './index';
import { DOCUMENTED_NAMES, NAME_PARTS } from './parts';

describe('name pools', () => {
  test('each class has exactly 200 names, all unique', () => {
    for (const id of CLASS_IDS) {
      const pool = NAMES_BY_CLASS[id];
      expect(pool).toHaveLength(NAMES_PER_CLASS);
      expect(new Set(pool).size).toBe(NAMES_PER_CLASS);
    }
  });

  test('the pools are disjoint — a name identifies its class', () => {
    for (const a of CLASS_IDS) {
      for (const b of CLASS_IDS) {
        if (a === b) continue;
        const other = new Set(NAMES_BY_CLASS[b]);
        expect(NAMES_BY_CLASS[a].filter((n) => other.has(n))).toEqual([]);
      }
    }
  });

  test('every name is [title] [given] [epithet] built from its own class parts', () => {
    for (const id of CLASS_IDS) {
      const parts = NAME_PARTS[id];
      for (const name of NAMES_BY_CLASS[id]) {
        const title = parts.titles.find((t) => t !== '' && name.startsWith(`${t} `)) ?? '';
        const epithet = parts.epithets.find((e) => name.endsWith(` ${e}`));
        expect(epithet, `no ${id} epithet in "${name}"`).toBeDefined();
        const given = name.slice(
          title === '' ? 0 : title.length + 1,
          name.length - (epithet?.length ?? 0) - 1,
        );
        expect(parts.givens, `unexpected given in "${name}"`).toContain(given);
      }
    }
  });

  test('the names printed in the design document are in their pools', () => {
    for (const id of CLASS_IDS) {
      for (const name of DOCUMENTED_NAMES[id]) {
        expect(NAMES_BY_CLASS[id]).toContain(name);
      }
    }
  });
});

describe('class flavour', () => {
  test('only warriors carry knightly titles', () => {
    for (const name of NAMES_BY_CLASS.warrior) {
      expect(NAME_PARTS.warrior.titles.some((t) => name.startsWith(`${t} `))).toBe(true);
    }
    for (const id of ['ranger', 'rogue'] as const) {
      for (const name of NAMES_BY_CLASS[id]) {
        expect(name.startsWith('Sir ') || name.startsWith('Dame ')).toBe(false);
      }
    }
  });

  test('rangers read as woodland and watchful', () => {
    const woodland = /watch|pine|leaf|wood|thorn|elm|root|mist|wind|dusk|ridge|vale|green/i;
    const hits = NAMES_BY_CLASS.ranger.filter((n) => woodland.test(n));
    expect(hits.length).toBeGreaterThan(NAMES_PER_CLASS / 2);
  });

  test('rogues read as money-minded', () => {
    const money =
      /purse|coin|penny|copper|paid|tax|debt|owed|overdue|share|tally|ledger|change/i;
    const hits = NAMES_BY_CLASS.rogue.filter((n) => money.test(n));
    expect(hits.length).toBeGreaterThan(NAMES_PER_CLASS / 2);
  });
});

describe('selection is deterministic', () => {
  test('the same seed yields the same sequence', () => {
    const a = new Rng(0xc0ffee);
    const b = new Rng(0xc0ffee);
    const draw = (rng: Rng): string[] =>
      Array.from({ length: 100 }, (_, i) => pickName(CLASS_IDS[i % 3]!, rng));
    expect(draw(a)).toEqual(draw(b));
  });

  test('a different seed yields a different sequence', () => {
    const draw = (seed: number): string[] => {
      const rng = new Rng(seed);
      return Array.from({ length: 50 }, () => pickName('warrior', rng));
    };
    expect(draw(1)).not.toEqual(draw(2));
  });

  test('every name in the pool is reachable', () => {
    const rng = new Rng(7);
    const seen = new Set<string>();
    for (let i = 0; i < 20000; i++) seen.add(pickName('rogue', rng));
    expect(seen.size).toBe(NAMES_PER_CLASS);
  });

  test('one call consumes exactly one draw from the world generator', () => {
    const withName = new Rng(42);
    pickName('ranger', withName);

    const control = new Rng(42);
    control.nextU32();

    expect(withName.snapshot()).toBe(control.snapshot());
  });
});

describe('nameAt', () => {
  test('indexes the pool directly and wraps in both directions', () => {
    expect(nameAt('warrior', 0)).toBe(NAMES_BY_CLASS.warrior[0]);
    expect(nameAt('warrior', NAMES_PER_CLASS)).toBe(NAMES_BY_CLASS.warrior[0]);
    expect(nameAt('warrior', -1)).toBe(NAMES_BY_CLASS.warrior[NAMES_PER_CLASS - 1]);
  });
});
