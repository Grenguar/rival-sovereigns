import { describe, expect, it } from 'vitest';
import type { EntityId, Snapshot } from '../core/types';
import { entityForHandle, formatGold, formatPercent, formatTick } from './format';

const snapshot = (): Snapshot => ({
  tick: 0,
  treasury: 0,
  escrow: 0,
  taxRate: 0,
  palaceLevel: 1,
  population: { heroes: 0, henchmen: 0, monsters: 0 },
  wave: 0,
  entities: [{ id: 3 as EntityId, handle: { index: 1, generation: 2 }, kind: 'hero', faction: 'crown', transform: { x: 0, y: 0, facing: 0 }, alive: true }],
  events: [],
  outcome: 'playing',
});

describe('HUD formatting', () => {
  it('formats stable player-facing values', () => {
    expect(formatGold(1234.9)).toBe('1,234 gold');
    expect(formatPercent(0.2)).toBe('20%');
    expect(formatTick(615)).toBe('1:01');
  });

  it('does not resolve a stale generational handle', () => {
    expect(entityForHandle(snapshot(), { index: 1, generation: 2 })?.id).toBe(3);
    expect(entityForHandle(snapshot(), { index: 1, generation: 3 })).toBeNull();
  });
});
