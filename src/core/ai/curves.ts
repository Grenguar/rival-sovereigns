/**
 * Runtime access to the generated response curves.
 *
 * Hand-written on purpose — curves.gen.ts holds only data, so regenerating it can
 * never clobber logic. Arithmetic here is + - * / only.
 */

import type { CurveFamily, TraitId, Traits } from '../types';

/** Linear interpolation between two 0..1 values. */
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/**
 * Samples a 256-entry table at x in 0..1 with linear interpolation between entries.
 * Out-of-range x is clamped rather than rejected; considerations occasionally produce
 * a hair over 1 through rounding and a throw there would be absurd.
 */
export function curve(table: Uint16Array, x: number): number {
  const c = x < 0 ? 0 : x > 1 ? 1 : x;
  const t = c * 255;
  const i = t | 0;
  const f = t - i;
  const a = table[i] as number;
  const b = table[i < 255 ? i + 1 : 255] as number;
  return (a + (b - a) * f) / 65535;
}

/**
 * Trait weighting is variant selection plus blending — docs/03-determinism.md §4.1.
 *
 * Traits run 0..1.8 (see the class table in docs/01-game-design.md §4.2): below 1 we
 * blend TIMID→NEUTRAL, above it NEUTRAL→BOLD. Deliberately not an exponent.
 */
export function traitCurve(family: CurveFamily, trait: number, x: number): number {
  if (trait <= 1) {
    const t = trait < 0 ? 0 : trait;
    return lerp(curve(family.TIMID, x), curve(family.NEUTRAL, x), t);
  }
  const t = (trait - 1) / 0.8;
  return lerp(curve(family.NEUTRAL, x), curve(family.BOLD, x), t > 1 ? 1 : t);
}

/** Convenience for considerations that carry an optional trait selector. */
export function evaluate(
  family: CurveFamily,
  x: number,
  traits: Traits,
  trait?: TraitId,
): number {
  return trait === undefined ? curve(family.NEUTRAL, x) : traitCurve(family, traits[trait], x);
}
