import { describe, expect, it } from 'vitest';
import type { EntityId } from '../types';
import { SpatialHash } from './hash';

describe('SpatialHash', () => {
  it('updates buckets incrementally and returns exact, id-sorted radius matches', () => {
    const hash = new SpatialHash();
    hash.insert(9 as EntityId, 2, 2);
    hash.insert(3 as EntityId, 63, 0);
    hash.insert(7 as EntityId, 65, 0);
    expect(hash.queryRadius(0, 0, 64)).toEqual([3 as EntityId, 9 as EntityId]);

    hash.update(7 as EntityId, 4, 0);
    expect(hash.queryRadius(0, 0, 5)).toEqual([7 as EntityId, 9 as EntityId]);
    expect(hash.remove(9 as EntityId)).toBe(true);
    expect(hash.size).toBe(2);
  });
});
