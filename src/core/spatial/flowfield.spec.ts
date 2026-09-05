import { describe, expect, it } from 'vitest';
import { findPath } from './astar';
import { FlowFieldCache } from './flowfield';
import { Grid } from './grid';

describe('flow fields', () => {
  it('reaches the A* destination from every start and refreshes after topology changes', () => {
    const grid = new Grid(6, 6);
    const cache = new FlowFieldCache();
    const destination = { tx: 5, ty: 5 };
    const field = cache.get(grid, destination);

    for (let ty = 0; ty < grid.height; ty++) {
      for (let tx = 0; tx < grid.width; tx++) {
        const start = { tx, ty };
        const route = findPath(grid, start, destination);
        if (route === null) {
          expect(field.nextStep(start)).toBeNull();
          continue;
        }

        let cursor = start;
        for (let step = 0; step < grid.width * grid.height; step++) {
          const next = field.nextStep(cursor);
          if (next === null) break;
          cursor = next;
        }
        expect(cursor).toEqual(destination);
      }
    }

    grid.setWalkable({ tx: 4, ty: 5 }, false);
    expect(field.isCurrent()).toBe(false);
    expect(cache.get(grid, destination)).not.toBe(field);
  });
});
