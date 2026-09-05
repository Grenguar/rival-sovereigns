/**
 * A3 — symbolic planning state. docs/04-ai-spec.md §2.
 *
 * Boolean, 32-bit, and deliberately small. *Which* target and *which* shop live on
 * the blackboard; keeping the planning space boolean is what keeps A* fast enough to
 * run on eighty agents inside a 1.2 ms budget.
 *
 * `mask` marks which symbols a state constrains, `values` holds their truth. Both
 * satisfaction and hashing are then single instructions.
 */

import { S, type State } from '../../types';

export const EMPTY_STATE: State = { values: 0, mask: 0 };

export const makeState = (values: number, mask: number): State => ({
  values: values | 0,
  mask: mask | 0,
});

/** A state constraining every listed symbol to true. */
export function requireAll(...symbols: S[]): State {
  let mask = 0;
  for (const s of symbols) mask |= s;
  return { values: mask, mask };
}

/** A state constraining every listed symbol to false. */
export function requireNone(...symbols: S[]): State {
  let mask = 0;
  for (const s of symbols) mask |= s;
  return { values: 0, mask };
}

/** Combines constraints. Later arguments win where they overlap. */
export function merge(...states: State[]): State {
  let values = 0;
  let mask = 0;
  for (const s of states) {
    values = (values & ~s.mask) | (s.values & s.mask);
    mask |= s.mask;
  }
  return { values, mask };
}

/**
 * True when `cur` meets every constraint `goal` expresses. Symbols `goal` does not
 * constrain are free.
 */
export const satisfies = (cur: State, goal: State): boolean =>
  (cur.values & goal.mask) === (goal.values & goal.mask);

/** The bits of `goal` that `cur` fails to meet. Zero means satisfied. */
export const unsatisfiedMask = (cur: State, goal: State): number =>
  ((cur.values ^ goal.values) & goal.mask) >>> 0;

/**
 * Backward chaining: remove what the action provides, add what it requires.
 * docs/04-ai-spec.md §6.
 */
export function regress(s: State, pre: State, eff: State): State {
  const values = ((s.values & ~eff.mask) | (pre.values & pre.mask)) | 0;
  const mask = ((s.mask & ~eff.mask) | pre.mask) | 0;
  return { values, mask };
}

/** Forward application — used by execution and by the planner property test. */
export function apply(s: State, eff: State): State {
  return {
    values: ((s.values & ~eff.mask) | (eff.values & eff.mask)) | 0,
    mask: (s.mask | eff.mask) | 0,
  };
}

/**
 * Hamming weight. The planner's admissible heuristic is the number of symbols still
 * unsatisfied — every action sets at least one, so it never overestimates.
 */
export function popcount(v: number): number {
  let x = v | 0;
  x = x - ((x >>> 1) & 0x55555555);
  x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
  x = (x + (x >>> 4)) & 0x0f0f0f0f;
  return (Math.imul(x, 0x01010101) >>> 24) | 0;
}

/** Single-word key for the seen-set and the plan cache. */
export function stateHash(s: State): number {
  let h = 0x811c9dc5;
  h = Math.imul(h ^ (s.values | 0), 0x01000193);
  h = Math.imul(h ^ (s.mask | 0), 0x01000193);
  return h >>> 0;
}

export const statesEqual = (a: State, b: State): boolean =>
  a.values === b.values && a.mask === b.mask;

/** Every symbol, in bit order — for the inspector and for debugging output. */
export const SYMBOL_NAMES: readonly [S, string][] = [
  [S.HAS_GOLD, 'HAS_GOLD'],
  [S.AT_TARGET, 'AT_TARGET'],
  [S.TARGET_DEAD, 'TARGET_DEAD'],
  [S.TARGET_KNOWN, 'TARGET_KNOWN'],
  [S.IS_INJURED, 'IS_INJURED'],
  [S.IS_CRITICAL, 'IS_CRITICAL'],
  [S.HAS_POTION, 'HAS_POTION'],
  [S.AT_MARKET, 'AT_MARKET'],
  [S.AT_SMITH, 'AT_SMITH'],
  [S.AT_INN, 'AT_INN'],
  [S.AT_HOME_GUILD, 'AT_HOME_GUILD'],
  [S.THREAT_NEARBY, 'THREAT_NEARBY'],
  [S.BOUNTY_KNOWN, 'BOUNTY_KNOWN'],
  [S.LAIR_KNOWN, 'LAIR_KNOWN'],
  [S.UPGRADE_AVAILABLE, 'UPGRADE_AVAILABLE'],
  [S.IS_RESTED, 'IS_RESTED'],
  [S.SAFE, 'SAFE'],
];

/** Human-readable rendering, e.g. "AT_TARGET, !IS_INJURED". */
export function describeState(s: State): string {
  const parts: string[] = [];
  for (const [bit, name] of SYMBOL_NAMES) {
    if ((s.mask & bit) === 0) continue;
    parts.push((s.values & bit) !== 0 ? name : `!${name}`);
  }
  return parts.length === 0 ? '<unconstrained>' : parts.join(', ');
}
