import { Sprite } from 'pixi.js';
import type { Texture } from 'pixi.js';
import type { FogState, TileCoord } from '../core/types';
import { tileToScreen } from '../core/spatial/iso';

export interface FogTile {
  readonly tile: TileCoord;
  readonly state: FogState;
}

/**
 * Read-only visibility, as the renderer needs it.
 *
 * The fog grid lives in world system state, not in the snapshot, so the app hands
 * the renderer a view onto it rather than the renderer reaching into the World.
 */
export interface FogView {
  readonly width: number;
  readonly height: number;
  at(tx: number, ty: number): FogState;
}

/**
 * Whether an entity standing here should be drawn at all.
 *
 * Fog that hides only the ground is scenery. What makes it fog of war is that an
 * enemy inside it is not on your screen: crown units are always yours to see,
 * enemy units only while somebody is looking, and enemy structures stay as last
 * seen because a warren does not move when you turn away.
 */
export function isEntityVisible(
  fog: FogView,
  faction: string,
  isStructure: boolean,
  tx: number,
  ty: number,
): boolean {
  if (faction === 'crown') return true;
  const state = fog.at(Math.round(tx), Math.round(ty));
  return isStructure ? state !== 0 : state === 2;
}

/** Matches --rs-fog in ui.css, so the unseen map and the chrome agree on black. */
const FOG_TINT = 0x0b0d14;

/** Draws only non-visible fog. Tile state comes from the fog system, never from renderer inference. */
export class FogRenderer {
  private readonly sprites = new Map<string, Sprite>();
  private readonly free: Sprite[] = [];

  sync(container: { addChild(sprite: Sprite): void; removeChild(sprite: Sprite): void }, tiles: readonly FogTile[], texture: Texture): void {
    const live = new Set<string>();
    for (const fog of tiles) {
      const key = `${fog.tile.tx},${fog.tile.ty}`;
      live.add(key);
      if (fog.state === 2) {
        this.release(key, container);
        continue;
      }
      let sprite = this.sprites.get(key);
      if (sprite === undefined) {
        sprite = this.free.pop() ?? new Sprite(texture);
        sprite.anchor.set(0.5, 0.5);
        container.addChild(sprite);
        this.sprites.set(key, sprite);
      }
      const position = tileToScreen(fog.tile);
      sprite.texture = texture;
      sprite.position.set(position.sx, position.sy + 16);
      // The caller passes a terrain diamond: multiplying it to near-black turns any
      // tile shape into a fog tile without spending an atlas frame on one.
      sprite.tint = FOG_TINT;
      // Explored has to read as clearly darker than visible or the distinction is
      // decorative: remembered ground is stale information and should look it.
      sprite.alpha = fog.state === 0 ? 0.94 : 0.62;
    }
    for (const key of this.sprites.keys()) if (!live.has(key)) this.release(key, container);
  }

  clear(container: { removeChild(sprite: Sprite): void }): void {
    for (const key of this.sprites.keys()) this.release(key, container);
  }

  private release(key: string, container: { removeChild(sprite: Sprite): void }): void {
    const sprite = this.sprites.get(key);
    if (sprite === undefined) return;
    container.removeChild(sprite);
    this.sprites.delete(key);
    this.free.push(sprite);
  }
}
