import { describe, expect, test } from 'vitest';
import type { Terrain, TileCoord } from '../../core/types';
import {
  type CompletedSite,
  type PlacementMap,
  type PlacementRules,
  validatePlacement,
} from './placement';

function map(width = 96, height = 96, overrides = new Map<string, Terrain | 'dirt'>()): PlacementMap {
  return {
    width,
    height,
    terrainAt(tile) {
      return overrides.get(`${tile.tx},${tile.ty}`) ?? 'grass';
    },
  };
}

const palace: CompletedSite = { kind: 'palace', tile: { tx: 40, ty: 54 }, complete: true };
const rules = (overrides: Partial<PlacementRules> = {}): PlacementRules => ({
  map: map(),
  completedSites: [palace],
  knownLairs: [],
  ...overrides,
});

describe('building placement', () => {
  test('allows an MVP footprint entirely within the initial Palace radius', () => {
    const result = validatePlacement({ kind: 'marketplace', tile: { tx: 43, ty: 57 } }, rules());
    expect(result).toMatchObject({ valid: true, reason: null });
    expect(result.footprint).toEqual([
      { tx: 43, ty: 57 }, { tx: 44, ty: 57 }, { tx: 43, ty: 58 }, { tx: 44, ty: 58 },
    ]);
  });

  test('uses every completed building as an eight-tile frontier extension', () => {
    const outpost: CompletedSite = { kind: 'marketplace', tile: { tx: 50, ty: 54 }, complete: true };
    expect(validatePlacement({ kind: 'guardhouse', tile: { tx: 58, ty: 54 } }, rules({ completedSites: [palace, outpost] })).valid).toBe(true);
  });

  test('does not extend the frontier from an unfinished building', () => {
    const unfinished: CompletedSite = { kind: 'marketplace', tile: { tx: 50, ty: 54 }, complete: false };
    expect(validatePlacement({ kind: 'guardhouse', tile: { tx: 58, ty: 54 } }, rules({ completedSites: [palace, unfinished] })).reason).toBe('outside-build-radius');
  });

  test('rejects water, dense forest, and map-edge overflow', () => {
    const water = new Map<string, Terrain | 'dirt'>([['43,57', 'water']]);
    expect(validatePlacement({ kind: 'marketplace', tile: { tx: 43, ty: 57 } }, rules({ map: map(96, 96, water) })).reason).toBe('blocked-terrain');
    expect(validatePlacement({ kind: 'marketplace', tile: { tx: 95, ty: 95 } }, rules()).reason).toBe('outside-map');
  });

  test('enforces occupied cells and a one-tile gap between footprints', () => {
    const guild: CompletedSite = { kind: 'warriorsGuild', tile: { tx: 43, ty: 54 }, complete: true };
    expect(validatePlacement({ kind: 'guardhouse', tile: { tx: 43, ty: 54 } }, rules({ completedSites: [palace, guild] })).reason).toBe('occupied');
    expect(validatePlacement({ kind: 'guardhouse', tile: { tx: 45, ty: 54 } }, rules({ completedSites: [palace, guild] })).reason).toBe('too-close-to-building');
  });

  test('blocks only lairs the player knows about', () => {
    const tile: TileCoord = { tx: 47, ty: 54 };
    expect(validatePlacement({ kind: 'guardhouse', tile }, rules()).valid).toBe(true);
    expect(validatePlacement({ kind: 'guardhouse', tile }, rules({ knownLairs: [{ tile: { tx: 57, ty: 54 } }] })).reason).toBe('too-close-to-known-lair');
  });
});
