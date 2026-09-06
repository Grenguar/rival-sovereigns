import { describe, expect, it } from 'vitest';
import { isShoreline, landscapeFrameName, terrainFrameName } from './landscape';

describe('landscape frame selection', () => {
  it('is deterministic and always returns a packed terrain variant', () => {
    const first = terrainFrameName('grass', 17, 23);
    expect(terrainFrameName('grass', 17, 23)).toBe(first);
    expect(first).toMatch(/^terrain_grass(?:_[12])?$/);
    expect(terrainFrameName('unknown', 17, 23)).toMatch(/^terrain_grass(?:_[12])?$/);
  });

  it('keeps decoration sparse and terrain-specific', () => {
    const allowed = new Set(['prop_aleppoPine', 'prop_oliveTree', 'prop_cypressTree', null]);
    for (let tx = 0; tx < 48; tx++) {
      expect(allowed.has(landscapeFrameName('forest', tx, 9, false))).toBe(true);
      expect(landscapeFrameName('water', tx, 9, false)).toBeNull();
    }
  });

  it('detects water edges without marking inland water', () => {
    const map = {
      width: 3,
      height: 3,
      terrain: ['grass', 'grass', 'grass', 'grass', 'water', 'water', 'grass', 'water', 'water'],
    };
    expect(isShoreline(map, 1, 1)).toBe(true);
    expect(isShoreline({ width: 3, height: 3, terrain: Array(9).fill('water') }, 1, 1)).toBe(false);
    expect(isShoreline(map, 0, 0)).toBe(false);
  });
});
