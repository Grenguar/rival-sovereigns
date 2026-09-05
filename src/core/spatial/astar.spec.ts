import { describe, expect, it } from 'vitest';
import { findPath, octileDistance, PathRequestQueue } from './astar';
import { Grid } from './grid';

describe('A* pathfinding', () => {
  it('uses octile costs and avoids diagonally cutting through a blocked corner', () => {
    const grid = new Grid(4, 4);
    grid.setWalkable({ tx: 1, ty: 0 }, false);
    grid.setWalkable({ tx: 0, ty: 1 }, false);

    expect(octileDistance({ tx: 0, ty: 0 }, { tx: 3, ty: 2 })).toBe(38);
    expect(findPath(grid, { tx: 0, ty: 0 }, { tx: 1, ty: 1 })).toBeNull();
  });

  it('returns endpoint-inclusive routes through the deterministic request budget', () => {
    const grid = new Grid(5, 1);
    const queue = new PathRequestQueue();
    const paths: Array<readonly { tx: number; ty: number }[] | null> = [];
    for (let i = 0; i < 3; i++) queue.enqueue({
      start: { tx: 0, ty: 0 },
      goal: { tx: 4, ty: 0 },
      resolve: (path) => paths.push(path),
    });

    expect(queue.process(grid, 2)).toBe(2);
    expect(queue.length).toBe(1);
    expect(paths[0]).toEqual([
      { tx: 0, ty: 0 }, { tx: 1, ty: 0 }, { tx: 2, ty: 0 }, { tx: 3, ty: 0 }, { tx: 4, ty: 0 },
    ]);
  });
});
