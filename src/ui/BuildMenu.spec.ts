import { describe, expect, it } from 'vitest';
import type { Snapshot } from '../core/types';
import { placementIssue } from './BuildMenu';
import type { BuildingOption, BuildingPlacement } from './BuildMenu';

const snapshot = (treasury: number, palaceLevel = 1): Snapshot => ({ tick: 0, treasury, escrow: 0, taxRate: 0.2, palaceLevel, population: { heroes: 0, henchmen: 0, monsters: 0 }, wave: 0, entities: [], events: [], outcome: 'playing' });
const inn: BuildingOption = { kind: 'inn', label: 'Inn', cost: 400, requiredPalaceLevel: 1 };
const tile: BuildingPlacement = { tile: { tx: 1, ty: 1 }, valid: true, reason: null };

describe('building placement feedback', () => {
  it('makes the specific blocking condition visible', () => {
    expect(placementIssue(snapshot(100), inn, tile)).toBe('Need 300 gold more.');
    expect(placementIssue(snapshot(1000), inn, { ...tile, valid: false, reason: 'Water blocks foundations.' })).toBe('Water blocks foundations.');
    expect(placementIssue(snapshot(1000), inn, tile)).toBeNull();
  });
});
