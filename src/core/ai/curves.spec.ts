import { describe, expect, test } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { curve, traitCurve, lerp } from './curves';
import { CURVE_FAMILIES, INVERSE, LINEAR, SATURATING } from './curves.gen';

const GENERATED = resolve(import.meta.dirname, 'curves.gen.ts');

describe('generated curve tables', () => {
  test('6 families x 3 variants of 256 entries', () => {
    expect(Object.keys(CURVE_FAMILIES)).toHaveLength(6);
    for (const family of Object.values(CURVE_FAMILIES)) {
      for (const variant of [family.TIMID, family.NEUTRAL, family.BOLD]) {
        expect(variant).toBeInstanceOf(Uint16Array);
        expect(variant).toHaveLength(256);
      }
    }
  });

  test('every entry is inside the 16-bit range', () => {
    for (const family of Object.values(CURVE_FAMILIES)) {
      for (const variant of [family.TIMID, family.NEUTRAL, family.BOLD]) {
        for (const v of variant) {
          expect(v).toBeGreaterThanOrEqual(0);
          expect(v).toBeLessThanOrEqual(65535);
        }
      }
    }
  });

  test('families are monotonic, so scoring stays explainable', () => {
    for (const [name, family] of Object.entries(CURVE_FAMILIES)) {
      const rising = !name.startsWith('INVERSE');
      for (const variant of [family.TIMID, family.NEUTRAL, family.BOLD]) {
        for (let i = 1; i < variant.length; i++) {
          const prev = variant[i - 1] as number;
          const cur = variant[i] as number;
          if (rising) expect(cur).toBeGreaterThanOrEqual(prev);
          else expect(cur).toBeLessThanOrEqual(prev);
        }
      }
    }
  });

  test('the generator is idempotent', () => {
    const before = readFileSync(GENERATED, 'utf8');
    execFileSync('npx', ['tsx', 'tools/gen-curves.ts'], {
      cwd: resolve(import.meta.dirname, '../../..'),
      stdio: 'ignore',
    });
    expect(readFileSync(GENERATED, 'utf8')).toBe(before);
  }, 60_000);
});

describe('curve()', () => {
  test('spans 0..1 at the endpoints', () => {
    expect(curve(LINEAR.NEUTRAL, 0)).toBeCloseTo(0, 5);
    expect(curve(LINEAR.NEUTRAL, 1)).toBeCloseTo(1, 5);
    expect(curve(INVERSE.NEUTRAL, 0)).toBeCloseTo(1, 5);
    expect(curve(INVERSE.NEUTRAL, 1)).toBeCloseTo(0, 5);
  });

  test('clamps out-of-range input rather than throwing', () => {
    expect(curve(LINEAR.NEUTRAL, -5)).toBe(curve(LINEAR.NEUTRAL, 0));
    expect(curve(LINEAR.NEUTRAL, 5)).toBe(curve(LINEAR.NEUTRAL, 1));
  });

  test('interpolates between entries instead of stepping', () => {
    const a = curve(LINEAR.NEUTRAL, 0.5);
    const b = curve(LINEAR.NEUTRAL, 0.5 + 1 / 512);
    expect(b).toBeGreaterThan(a);
  });

  test('LINEAR.NEUTRAL is actually linear', () => {
    expect(curve(LINEAR.NEUTRAL, 0.25)).toBeCloseTo(0.25, 3);
    expect(curve(LINEAR.NEUTRAL, 0.75)).toBeCloseTo(0.75, 3);
  });

  test('SATURATING rises faster than linear early on', () => {
    expect(curve(SATURATING.NEUTRAL, 0.25)).toBeGreaterThan(0.25);
  });

  test('is deterministic across repeated calls', () => {
    for (let i = 0; i <= 100; i++) {
      const x = i / 100;
      expect(curve(INVERSE.BOLD, x)).toBe(curve(INVERSE.BOLD, x));
    }
  });
});

describe('traitCurve()', () => {
  test('lands exactly on a variant at 0, 1 and 1.8', () => {
    expect(traitCurve(LINEAR, 0, 0.5)).toBeCloseTo(curve(LINEAR.TIMID, 0.5), 6);
    expect(traitCurve(LINEAR, 1, 0.5)).toBeCloseTo(curve(LINEAR.NEUTRAL, 0.5), 6);
    expect(traitCurve(LINEAR, 1.8, 0.5)).toBeCloseTo(curve(LINEAR.BOLD, 0.5), 6);
  });

  test('blends monotonically between variants', () => {
    const at = (t: number) => traitCurve(LINEAR, t, 0.5);
    expect(at(0.5)).toBeGreaterThan(at(0));
    expect(at(0.5)).toBeLessThan(at(1));
  });

  test('clamps a trait beyond the documented range', () => {
    expect(traitCurve(LINEAR, 5, 0.5)).toBeCloseTo(curve(LINEAR.BOLD, 0.5), 6);
    expect(traitCurve(LINEAR, -1, 0.5)).toBeCloseTo(curve(LINEAR.TIMID, 0.5), 6);
  });

  test('a bold hero discounts danger less steeply than a timid one', () => {
    // INVERSE on a danger input: higher output means "this bothers me less".
    const danger = 0.7;
    expect(traitCurve(INVERSE, 1.8, danger)).toBeGreaterThan(traitCurve(INVERSE, 0.2, danger));
  });
});

describe('lerp()', () => {
  test('hits both ends and the midpoint', () => {
    expect(lerp(2, 10, 0)).toBe(2);
    expect(lerp(2, 10, 1)).toBe(10);
    expect(lerp(2, 10, 0.5)).toBe(6);
  });
});
