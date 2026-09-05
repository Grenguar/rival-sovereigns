import { Sprite } from 'pixi.js';
import type { Texture } from 'pixi.js';
import type { FogState, TileCoord } from '../core/types';
import { tileToScreen } from '../core/spatial/iso';

export interface FogTile {
  readonly tile: TileCoord;
  readonly state: FogState;
}

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
      sprite.alpha = fog.state === 0 ? 0.92 : 0.48;
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
