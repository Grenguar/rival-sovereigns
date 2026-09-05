/**
 * A5 — LRU plan cache keyed on (goalId, stateHash, classId).
 *
 * Dozens of heroes share situations constantly, so the hit rate should exceed 80%.
 * Hits and misses are exposed because a collapsing hit rate is the first sign of a
 * performance problem — docs/04-ai-spec.md §6.
 */

import type { ClassId, GoalId, PlannerStats, State } from '../../types';
import { PLAN_CACHE_CAPACITY } from '../../../content/balance';
import { stateHash } from './state';
import type { PlanResult } from './planner';

export function planKey(goalId: GoalId, state: State, classId: ClassId): string {
  return `${goalId}:${stateHash(state)}:${classId}`;
}

/**
 * Map preserves insertion order, so re-inserting on read is enough to maintain LRU
 * order without a linked list.
 */
export class PlanCache {
  private entries = new Map<string, PlanResult | null>();

  constructor(
    private readonly capacity: number = PLAN_CACHE_CAPACITY,
    private readonly stats?: PlannerStats,
  ) {}

  get size(): number {
    return this.entries.size;
  }

  /** Returns undefined on a miss. A cached *null* is a real result and returns null. */
  get(key: string): PlanResult | null | undefined {
    if (!this.entries.has(key)) {
      if (this.stats) this.stats.misses++;
      return undefined;
    }
    const value = this.entries.get(key) as PlanResult | null;
    this.entries.delete(key);
    this.entries.set(key, value); // touch — moves to the most-recent end
    if (this.stats) this.stats.hits++;
    return value;
  }

  set(key: string, value: PlanResult | null): void {
    if (this.entries.has(key)) this.entries.delete(key);
    this.entries.set(key, value);
    while (this.entries.size > this.capacity) {
      // The first key is the least recently used.
      const oldest = this.entries.keys().next();
      if (oldest.done === true) break;
      this.entries.delete(oldest.value);
    }
  }

  clear(): void {
    this.entries.clear();
  }

  hitRate(): number {
    if (this.stats === undefined) return 0;
    const total = this.stats.hits + this.stats.misses;
    return total === 0 ? 0 : this.stats.hits / total;
  }
}
