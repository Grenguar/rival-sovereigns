import { describe, expect, it } from 'vitest';
import type { EntityId } from '../types';
import { Grid } from './grid';

describe('Grid', () => {
  it('records tile state and only bumps topology for navigation changes', () => {
    const grid = new Grid(3, 2);
    const tile = { tx: 1, ty: 1 };

    grid.setOccupant(tile, 7 as EntityId);
    grid.setFog(tile, 2);
    expect(grid.topologyVersion).toBe(0);

    grid.setBuilding(tile, 8 as EntityId);
    expect(grid.isWalkable(tile)).toBe(false);
    expect(grid.topologyVersion).toBe(1);

    grid.setBuilding(tile, null);
    expect(grid.isWalkable(tile)).toBe(true);
    expect(grid.topologyVersion).toBe(2);
  });

  it('rejects coordinates outside its fixed map bounds', () => {
    const grid = new Grid(2, 2);
    expect(grid.contains({ tx: -1, ty: 0 })).toBe(false);
    expect(() => grid.tileAt({ tx: 2, ty: 0 })).toThrow('outside the grid');
  });

  it('does not turn impassable terrain walkable when a building is removed', () => {
    const grid = new Grid(2, 2);
    const tile = { tx: 1, ty: 1 };
    grid.setTerrain(tile, 'water', false);
    grid.setBuilding(tile, 8 as EntityId);
    grid.setBuilding(tile, null);
    expect(grid.isWalkable(tile)).toBe(false);
  });
});
