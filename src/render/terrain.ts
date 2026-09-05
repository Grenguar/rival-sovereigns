import { Container, RenderTexture, Sprite } from 'pixi.js';
import type { Renderer } from 'pixi.js';

export const TERRAIN_CHUNK_TILES = 16;
export const TERRAIN_CHUNK_WIDTH = TERRAIN_CHUNK_TILES * 64;
export const TERRAIN_CHUNK_HEIGHT = TERRAIN_CHUNK_TILES * 32;

export interface TerrainChunkCoord { readonly cx: number; readonly cy: number; }
export interface TerrainChunkPainter {
  /** Paints a chunk in local texture coordinates; the cache owns its lifetime. */
  (container: Container, chunk: TerrainChunkCoord): void;
}

interface Chunk {
  readonly texture: RenderTexture;
  readonly sprite: Sprite;
  dirty: boolean;
}

/** Bakes 16×16 terrain regions only after a map/topology edit, never every frame. */
export class TerrainChunkCache {
  private readonly chunks = new Map<string, Chunk>();

  constructor(private readonly renderer: Renderer, private readonly layer: Container) {}

  ensure(chunk: TerrainChunkCoord, x: number, y: number): void {
    const key = keyOf(chunk);
    if (this.chunks.has(key)) return;
    const texture = RenderTexture.create({ width: TERRAIN_CHUNK_WIDTH, height: TERRAIN_CHUNK_HEIGHT });
    const sprite = new Sprite(texture);
    sprite.position.set(x, y);
    this.layer.addChild(sprite);
    this.chunks.set(key, { texture, sprite, dirty: true });
  }

  invalidate(chunk: TerrainChunkCoord): void {
    const cached = this.chunks.get(keyOf(chunk));
    if (cached !== undefined) cached.dirty = true;
  }

  rebuild(paint: TerrainChunkPainter): number {
    let rebuilt = 0;
    for (const [key, chunk] of this.chunks) {
      if (!chunk.dirty) continue;
      const [cx, cy] = key.split(',').map(Number) as [number, number];
      const source = new Container();
      paint(source, { cx, cy });
      this.renderer.render({ container: source, target: chunk.texture, clear: true });
      source.destroy({ children: true });
      chunk.dirty = false;
      rebuilt++;
    }
    return rebuilt;
  }

  destroy(): void {
    for (const chunk of this.chunks.values()) {
      this.layer.removeChild(chunk.sprite);
      chunk.sprite.destroy();
      chunk.texture.destroy(true);
    }
    this.chunks.clear();
  }
}

function keyOf(chunk: TerrainChunkCoord): string { return `${chunk.cx},${chunk.cy}`; }
