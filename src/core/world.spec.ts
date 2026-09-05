import { describe, expect, test, vi } from 'vitest';
import { World, ECONOMY_PERIOD } from './world';

describe('World entity pool', () => {
  test('handles are generational and stale ones resolve to null', () => {
    const w = new World(1);
    const e = w.spawn({ kind: 'hero', faction: 'crown', x: 0, y: 0 });
    const handle = e.handle;
    expect(w.get(handle)).toBe(e);

    w.kill(handle);
    w.step(); // reap recycles the slot

    expect(w.get(handle)).toBeNull();
    expect(w.isAlive(handle)).toBe(false);
  });

  test('a recycled slot does not resurrect the old handle', () => {
    const w = new World(1);
    const first = w.spawn({ kind: 'monster', faction: 'monsters', x: 0, y: 0 });
    const stale = first.handle;
    w.kill(stale);
    w.step();

    const second = w.spawn({ kind: 'monster', faction: 'monsters', x: 0, y: 0 });
    expect(second.handle.index).toBe(stale.index);
    expect(second.handle.generation).not.toBe(stale.generation);
    expect(w.get(stale)).toBeNull();
    expect(w.get(second.handle)).toBe(second);
  });

  test('buildings and lairs survive the reaper so rubble can persist', () => {
    const w = new World(1);
    const b = w.spawn({ kind: 'building', faction: 'crown', x: 0, y: 0 });
    w.kill(b.handle);
    w.step();
    expect(w.get(b.handle)).toBe(b);
    expect(b.alive).toBe(false);
  });

  test('entitiesInIdOrder is ascending by id', () => {
    const w = new World(1);
    for (let i = 0; i < 20; i++) {
      w.spawn({ kind: 'prop', faction: 'neutral', x: i, y: 0 });
    }
    const ids = w.entitiesInIdOrder().map((e) => e.id);
    expect([...ids].sort((a, b) => a - b)).toEqual(ids);
  });

  test('views are cached until membership changes', () => {
    const w = new World(1);
    w.spawn({ kind: 'building', faction: 'crown', x: 0, y: 0 }).building = {
      kind: 'palace',
      state: 'complete',
      progress: 1,
      level: 1,
      vault: 0,
      spawnCooldown: 0,
      footprint: [],
    };
    const first = w.views.buildings;
    expect(w.views.buildings).toBe(first); // same array instance, no rebuild
    w.spawn({ kind: 'prop', faction: 'neutral', x: 1, y: 1 });
    expect(w.views.buildings).not.toBe(first);
  });
});

describe('World tick', () => {
  test('runs the phases in the documented order', () => {
    const w = new World(1);
    const seen: string[] = [];
    const mark = (name: keyof typeof w.hooks) => w.hooks[name].push(() => seen.push(name));
    (
      [
        'sensors',
        'goalSelection',
        'planning',
        'actions',
        'fsm',
        'movement',
        'combat',
        'economy',
        'spawning',
        'flags',
        'cleanup',
        'fog',
      ] as const
    ).forEach(mark);

    w.step(); // tick 0 — economy runs (0 % 10 === 0)
    expect(seen).toEqual([
      'sensors',
      'goalSelection',
      'planning',
      'actions',
      'fsm',
      'movement',
      'combat',
      'economy',
      'spawning',
      'flags',
      'cleanup',
      'fog',
    ]);
  });

  test('economy runs at 1 Hz, not 10', () => {
    const w = new World(1);
    const economy = vi.fn();
    w.hooks.economy.push(economy);
    for (let i = 0; i < ECONOMY_PERIOD * 3; i++) w.step();
    expect(economy).toHaveBeenCalledTimes(3);
  });
});

describe('World commands', () => {
  test('commands are drained at the start of the next tick, never inline', () => {
    const w = new World(1);
    const seen: number[] = [];
    w.commandHandlers.push((c, world) => {
      if (c.t === 'SET_TAX_RATE') seen.push(world.tick);
    });

    w.step();
    w.issue({ t: 'SET_TAX_RATE', rate: 0.4 });
    expect(seen).toEqual([]); // not applied on issue
    w.step();
    expect(seen).toEqual([1]);
  });

  test('the command log records the tick each command was applied on', () => {
    const w = new World(1);
    w.step();
    w.step();
    w.issue({ t: 'DEMOLISH', id: 1 as never });
    w.step();
    expect(w.commandLog).toEqual([{ tick: 2, command: { t: 'DEMOLISH', id: 1 } }]);
  });
});

describe('World snapshot', () => {
  test('counts population by kind and exposes this tick events only', () => {
    const w = new World(1);
    w.spawn({ kind: 'hero', faction: 'crown', x: 0, y: 0 });
    w.spawn({ kind: 'hero', faction: 'crown', x: 1, y: 0 });
    w.spawn({ kind: 'monster', faction: 'monsters', x: 2, y: 0 });

    const snap = w.snapshot();
    expect(snap.population).toEqual({ heroes: 2, henchmen: 0, monsters: 1 });
    expect(snap.events).toHaveLength(3); // three SPAWN events

    w.step();
    expect(w.snapshot().events).toHaveLength(0);
  });
});
