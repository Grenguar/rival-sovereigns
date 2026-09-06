/** Visual-only terrain variation. It never feeds back into simulation state. */

export type TerrainFrameName =
  | 'terrain_grass'
  | 'terrain_grass_1'
  | 'terrain_grass_2'
  | 'terrain_forest'
  | 'terrain_forest_1'
  | 'terrain_forest_2'
  | 'terrain_water'
  | 'terrain_water_1'
  | 'terrain_water_2'
  | 'terrain_rock'
  | 'terrain_rock_1'
  | 'terrain_rock_2'
  | 'terrain_road'
  | 'terrain_road_1'
  | 'terrain_road_2';

export type LandscapeFrameName =
  | 'prop_aleppoPine'
  | 'prop_oliveTree'
  | 'prop_orangeTree'
  | 'prop_cypressTree'
  | 'prop_vineyardRow'
  | 'prop_wheatField'
  | 'prop_mountainCrag'
  | 'prop_dryStoneWall'
  | 'prop_shorelineRocks';

const TERRAIN_KINDS = new Set(['grass', 'forest', 'water', 'rock', 'road']);

export function terrainFrameName(terrain: string, tx: number, ty: number): TerrainFrameName {
  const kind = TERRAIN_KINDS.has(terrain) ? terrain : 'grass';
  const variant = coordinateHash(tx, ty) % 3;
  return `terrain_${kind}${variant === 0 ? '' : `_${String(variant)}`}` as TerrainFrameName;
}

export function landscapeFrameName(
  terrain: string,
  tx: number,
  ty: number,
  shoreline: boolean,
): LandscapeFrameName | null {
  const selector = coordinateHash(tx + 97, ty - 53);
  if (terrain === 'forest') {
    const value = selector % 32;
    if (value === 0) return 'prop_aleppoPine';
    if (value === 1) return 'prop_oliveTree';
    if (value === 2) return 'prop_cypressTree';
  }
  if (terrain === 'grass') {
    const value = selector % 160;
    if (value === 0) return 'prop_wheatField';
    if (value === 1) return 'prop_vineyardRow';
    if (value === 2) return 'prop_orangeTree';
  }
  if (terrain === 'rock' && selector % 18 === 0) return 'prop_mountainCrag';
  if (terrain === 'road' && selector % 96 === 0) return 'prop_dryStoneWall';
  if (terrain === 'water' && shoreline && selector % 5 === 0) return 'prop_shorelineRocks';
  return null;
}

export interface TerrainGrid {
  readonly width: number;
  readonly height: number;
  readonly terrain: readonly string[];
}

export function isShoreline(map: TerrainGrid, tx: number, ty: number): boolean {
  if (map.terrain[ty * map.width + tx] !== 'water') return false;
  for (const [dx, dy] of [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ] as const) {
    const nx = tx + dx;
    const ny = ty + dy;
    if (nx < 0 || ny < 0 || nx >= map.width || ny >= map.height) return true;
    if (map.terrain[ny * map.width + nx] !== 'water') return true;
  }
  return false;
}

function coordinateHash(tx: number, ty: number): number {
  let value = (Math.imul(tx, 0x45d9f3b) ^ Math.imul(ty, 0x119de1f3)) >>> 0;
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b) >>> 0;
  return (value ^ (value >>> 16)) >>> 0;
}
