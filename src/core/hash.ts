/**
 * FNV-1a over canonical world state — docs/03-determinism.md §5.2.
 *
 * Positions are quantised to 1/1000 before mixing. That is not a tolerance: the
 * underlying floats are already bit-identical. It keeps the hash stable if harmless
 * precision from display interpolation ever leaks into a debug path.
 */

import type { Entity } from './types';

const PRIME = 0x01000193;

export class Hasher {
  private h = 0x811c9dc5;

  mix(v: number): this {
    this.h = Math.imul(this.h ^ (v | 0), PRIME);
    return this;
  }

  /** Quantise a continuous value to 1/1000 before mixing. */
  mixPos(v: number): this {
    return this.mix((v * 1000) | 0);
  }

  value(): number {
    return this.h >>> 0;
  }
}

export interface HashableWorld {
  readonly tick: number;
  readonly treasury: number;
  readonly escrow: number;
  /** Quantised: the rate is player-set in coarse steps, never a computed float. */
  readonly taxRate: number;
  readonly rng: { snapshot(): number };
  entitiesInIdOrder(): Iterable<Entity>;
}

export function hashWorld(w: HashableWorld): number {
  const h = new Hasher();
  h.mix(w.tick);
  h.mix(w.treasury);
  h.mix(w.escrow);
  // Tax rate drives effective loyalty, so it changes behaviour and must be hashed.
  h.mix((w.taxRate * 1000) | 0);
  h.mix(w.rng.snapshot());

  for (const e of w.entitiesInIdOrder()) {
    h.mix(e.id);
    h.mixPos(e.transform.x);
    h.mixPos(e.transform.y);
    h.mix(e.transform.facing);
    h.mix(e.health?.hp ?? 0);
    h.mix(e.alive ? 1 : 0);
    h.mix(goalOrdinal(e.agent?.currentGoal ?? null));
    h.mix(e.purse?.gold ?? 0);
  }

  return h.value();
}

/**
 * Goal ids are strings for readability everywhere else; the hash needs a stable
 * integer. Order is append-only — inserting into the middle changes every golden hash.
 */
const GOAL_ORDER = [
  'Survive',
  'Heal',
  'ClaimBounty',
  'HuntMonster',
  'DefendHome',
  'Upgrade',
  'Explore',
  'Idle',
  'AttackStructure',
  'AttackHenchman',
] as const;

function goalOrdinal(g: string | null): number {
  if (g === null) return -1;
  const i = (GOAL_ORDER as readonly string[]).indexOf(g);
  return i;
}
