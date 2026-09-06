import { describe, expect, it } from 'vitest';
import type { Snapshot, WorldEvent } from '../src/core/types';
import { spawnEventFx } from '../src/render/event-fx';
import type { StageRenderer } from '../src/render/stage';

interface Spawned {
  readonly kind: string;
  readonly x: number;
  readonly y: number;
}

function fakeRenderer(into: Spawned[]): StageRenderer {
  return {
    spawnFx: (kind: string, x: number, y: number): void => {
      into.push({ kind, x, y });
    },
  } as unknown as StageRenderer;
}

function snapshotWith(events: readonly WorldEvent[]): Snapshot {
  return {
    tick: 1,
    treasury: 0,
    escrow: 0,
    taxRate: 0.2,
    palaceLevel: 1,
    population: { heroes: 0, henchmen: 0, monsters: 0 },
    wave: 0,
    entities: [
      { id: 7, transform: { x: 3, y: 4 } },
      { id: 9, transform: { x: 11, y: 2 } },
    ] as unknown as Snapshot['entities'],
    events,
    outcome: 'playing',
  };
}

describe('event-driven ground effects', () => {
  it('marks the spot where something died and where something was built', () => {
    const spawned: Spawned[] = [];
    spawnEventFx(
      fakeRenderer(spawned),
      snapshotWith([
        { t: 'DEATH', entity: 7, killer: 9 },
        { t: 'BUILD_COMPLETE', entity: 9 },
      ] as unknown as WorldEvent[]),
      0,
      () => ({}) as never,
    );

    expect(spawned).toEqual([
      { kind: 'deathDecal', x: 3, y: 4 },
      { kind: 'constructionDust', x: 11, y: 2 },
    ]);
  });

  it('ignores events it has no effect for, and entities already retired', () => {
    const spawned: Spawned[] = [];
    spawnEventFx(
      fakeRenderer(spawned),
      snapshotWith([
        { t: 'DAMAGE', target: 7, amount: 4, from: 9 },
        // A death can retire its entity in the same tick that reports it.
        { t: 'DEATH', entity: 404, killer: null },
      ] as unknown as WorldEvent[]),
      0,
      () => ({}) as never,
    );

    expect(spawned).toEqual([]);
  });
});
