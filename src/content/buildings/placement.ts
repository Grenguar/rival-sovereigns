import type { BuildingKind, Terrain, TileCoord } from '../../core/types';
import { BUILDINGS } from './index';

export const INITIAL_BUILD_RADIUS = 12;
export const COMPLETED_BUILD_RADIUS = 8;
export const LAIR_EXCLUSION_RADIUS = 10;

export type PlacementReason =
  | 'unknown-building'
  | 'outside-map'
  | 'outside-build-radius'
  | 'blocked-terrain'
  | 'occupied'
  | 'too-close-to-building'
  | 'too-close-to-known-lair';

export interface CompletedSite {
  readonly kind: BuildingKind;
  readonly tile: TileCoord;
  readonly complete: boolean;
}

export interface KnownLairSite {
  readonly tile: TileCoord;
}

export interface PlacementMap {
  readonly width: number;
  readonly height: number;
  terrainAt(tile: TileCoord): Terrain | 'dirt' | null;
}

export interface PlacementRequest {
  readonly kind: BuildingKind;
  readonly tile: TileCoord;
}

export interface PlacementRules {
  readonly map: PlacementMap;
  readonly completedSites: readonly CompletedSite[];
  /** Lairs the Crown knows about; undiscovered lairs do not block construction. */
  readonly knownLairs: readonly KnownLairSite[];
}

export interface PlacementResult {
  readonly valid: boolean;
  readonly reason: PlacementReason | null;
  readonly footprint: readonly TileCoord[];
}

const BUILDABLE_TERRAIN = new Set<Terrain | 'dirt'>(['grass', 'dirt']);

export const placementMessage: Record<PlacementReason, string> = {
  'unknown-building': 'That building is not available.',
  'outside-map': 'The entire footprint must be inside the map.',
  'outside-build-radius': 'Build outward from the Palace or a completed building.',
  'blocked-terrain': 'Foundations need grass or dirt, not water, forest, rock, or road.',
  occupied: 'Another building already occupies that space.',
  'too-close-to-building': 'Leave at least one tile between buildings.',
  'too-close-to-known-lair': 'Build at least 10 tiles from a known lair.',
};

/**
 * Validates placement without reading World. This keeps the preview and command
 * handler on the same deterministic rules once Track A wires the latter in.
 */
export function validatePlacement(request: PlacementRequest, rules: PlacementRules): PlacementResult {
  const def = BUILDINGS[request.kind];
  if (def === undefined) return invalid('unknown-building', []);

  const footprint = footprintAt(request.tile, def.footprint);
  if (footprint.some((tile) => !inBounds(tile, rules.map))) return invalid('outside-map', footprint);
  if (footprint.some((tile) => !withinBuildRadius(tile, rules.completedSites))) {
    return invalid('outside-build-radius', footprint);
  }
  // terrainAt returns null off the map. The bounds check above already rejected
  // that, but treating an unknown tile as unbuildable is the safe direction.
  if (
    footprint.some((tile) => {
      const terrain = rules.map.terrainAt(tile);
      return terrain === null || !BUILDABLE_TERRAIN.has(terrain);
    })
  ) {
    return invalid('blocked-terrain', footprint);
  }
  if (footprint.some((tile) => overlaps(tile, rules.completedSites))) return invalid('occupied', footprint);
  if (footprint.some((tile) => violatesSpacing(tile, rules.completedSites))) {
    return invalid('too-close-to-building', footprint);
  }
  if (footprint.some((tile) => tooCloseToKnownLair(tile, rules.knownLairs))) {
    return invalid('too-close-to-known-lair', footprint);
  }
  return { valid: true, reason: null, footprint };
}

export function footprintAt(origin: TileCoord, size: { readonly w: number; readonly h: number }): TileCoord[] {
  const tiles: TileCoord[] = [];
  for (let dy = 0; dy < size.h; dy++) for (let dx = 0; dx < size.w; dx++) tiles.push({ tx: origin.tx + dx, ty: origin.ty + dy });
  return tiles;
}

function invalid(reason: PlacementReason, footprint: readonly TileCoord[]): PlacementResult {
  return { valid: false, reason, footprint };
}

function inBounds(tile: TileCoord, map: PlacementMap): boolean {
  return tile.tx >= 0 && tile.ty >= 0 && tile.tx < map.width && tile.ty < map.height;
}

function withinBuildRadius(tile: TileCoord, sites: readonly CompletedSite[]): boolean {
  return sites.some((site) => {
    if (!site.complete) return false;
    const radius = site.kind === 'palace' ? INITIAL_BUILD_RADIUS : COMPLETED_BUILD_RADIUS;
    return squaredDistance(tile, site.tile) <= radius * radius;
  });
}

function overlaps(tile: TileCoord, sites: readonly CompletedSite[]): boolean {
  return sites.some((site) => {
    const def = BUILDINGS[site.kind];
    if (def === undefined) return false;
    return footprintAt(site.tile, def.footprint).some((other) => sameTile(tile, other));
  });
}

function violatesSpacing(tile: TileCoord, sites: readonly CompletedSite[]): boolean {
  return sites.some((site) => {
    const def = BUILDINGS[site.kind];
    if (def === undefined) return false;
    return footprintAt(site.tile, def.footprint).some(
      (other) => chebyshevDistance(tile, other) === 1,
    );
  });
}

function tooCloseToKnownLair(tile: TileCoord, lairs: readonly KnownLairSite[]): boolean {
  return lairs.some((lair) => squaredDistance(tile, lair.tile) <= LAIR_EXCLUSION_RADIUS * LAIR_EXCLUSION_RADIUS);
}

function squaredDistance(a: TileCoord, b: TileCoord): number {
  const dx = a.tx - b.tx;
  const dy = a.ty - b.ty;
  return dx * dx + dy * dy;
}

function chebyshevDistance(a: TileCoord, b: TileCoord): number {
  return Math.max(Math.abs(a.tx - b.tx), Math.abs(a.ty - b.ty));
}

function sameTile(a: TileCoord, b: TileCoord): boolean {
  return a.tx === b.tx && a.ty === b.ty;
}
