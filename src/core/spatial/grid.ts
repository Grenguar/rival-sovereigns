import type { EntityId, FogState, Terrain, TileCoord } from '../types';
import { FOG_UNSEEN } from '../types';

export interface Tile {
  terrain: Terrain;
  /** Walkability contributed by terrain, before a building footprint is applied. */
  terrainWalkable: boolean;
  walkable: boolean;
  occupant: EntityId | null;
  building: EntityId | null;
  fog: FogState;
}

export interface GridOptions {
  terrain?: Terrain;
  walkable?: boolean;
}

const DEFAULT_TILE: Tile = {
  terrain: 'grass',
  terrainWalkable: true,
  walkable: true,
  occupant: null,
  building: null,
  fog: FOG_UNSEEN,
};

/**
 * The authoritative topology for all grid navigation. Unit occupancy is recorded
 * here for sensors, but deliberately does not make a tile unwalkable: agents move
 * through one another rather than generating pathfinding stampedes.
 */
export class Grid {
  readonly width: number;
  readonly height: number;
  private readonly tiles: Tile[];
  private _topologyVersion = 0;

  constructor(width: number, height: number, options: GridOptions = {}) {
    if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
      throw new Error('Grid dimensions must be positive integers.');
    }

    this.width = width;
    this.height = height;
    const terrain = options.terrain ?? DEFAULT_TILE.terrain;
    const walkable = options.walkable ?? DEFAULT_TILE.walkable;
    this.tiles = Array.from({ length: width * height }, () => ({
      ...DEFAULT_TILE,
      terrain,
      terrainWalkable: walkable,
      walkable,
    }));
  }

  get topologyVersion(): number {
    return this._topologyVersion;
  }

  contains(tile: TileCoord): boolean {
    return tile.tx >= 0 && tile.tx < this.width && tile.ty >= 0 && tile.ty < this.height;
  }

  indexOf(tile: TileCoord): number {
    if (!this.contains(tile)) throw new Error(`Tile (${tile.tx}, ${tile.ty}) is outside the grid.`);
    return tile.ty * this.width + tile.tx;
  }

  coordOf(index: number): TileCoord {
    if (index < 0 || index >= this.tiles.length) throw new Error(`Tile index ${index} is outside the grid.`);
    return { tx: index % this.width, ty: Math.floor(index / this.width) };
  }

  tileAt(tile: TileCoord): Readonly<Tile> {
    return this.tiles[this.indexOf(tile)] as Tile;
  }

  isWalkable(tile: TileCoord): boolean {
    return this.contains(tile) && (this.tiles[this.indexOf(tile)] as Tile).walkable;
  }

  setTerrain(tile: TileCoord, terrain: Terrain, walkable: boolean): void {
    const cell = this.tiles[this.indexOf(tile)] as Tile;
    const resolvedWalkable = walkable && cell.building === null;
    const topologyChanged = cell.terrain !== terrain || cell.terrainWalkable !== walkable || cell.walkable !== resolvedWalkable;
    cell.terrain = terrain;
    cell.terrainWalkable = walkable;
    cell.walkable = resolvedWalkable;
    if (topologyChanged) this._topologyVersion++;
  }

  setWalkable(tile: TileCoord, walkable: boolean): void {
    const cell = this.tiles[this.indexOf(tile)] as Tile;
    const resolvedWalkable = walkable && cell.building === null;
    if (cell.terrainWalkable === walkable && cell.walkable === resolvedWalkable) return;
    cell.terrainWalkable = walkable;
    cell.walkable = resolvedWalkable;
    this._topologyVersion++;
  }

  setBuilding(tile: TileCoord, building: EntityId | null): void {
    const cell = this.tiles[this.indexOf(tile)] as Tile;
    if (cell.building === building) return;
    cell.building = building;
    cell.walkable = cell.terrainWalkable && building === null;
    this._topologyVersion++;
  }

  setOccupant(tile: TileCoord, occupant: EntityId | null): void {
    (this.tiles[this.indexOf(tile)] as Tile).occupant = occupant;
  }

  setFog(tile: TileCoord, fog: FogState): void {
    (this.tiles[this.indexOf(tile)] as Tile).fog = fog;
  }
}
