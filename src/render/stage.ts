import { Application, Container, Sprite } from 'pixi.js';
import type { Texture } from 'pixi.js';
import type { Entity, EntityId, Snapshot, TileCoord } from '../core/types';
import { compareDepth, screenToWorld, worldToScreen } from '../core/spatial/iso';
import type { Camera } from './camera';
import { FogRenderer } from './fog';
import { MIRRORED_FACINGS } from './frame-for';
import { GroundFxRenderer } from './fx';
import { interpolatePosition } from './interpolate';
import { TerrainChunkCache } from './terrain';

export interface TerrainMap {
  readonly width: number;
  readonly height: number;
  readonly terrain: readonly string[];
}

export type RenderLayerName =
  'terrain' | 'fog' | 'buildings' | 'groundFx' | 'units' | 'overlays' | 'flags';

export interface RenderLayers {
  readonly terrain: Container;
  readonly fog: Container;
  /** Buildings and units deliberately share this layer to preserve depth interleaving. */
  readonly buildings: Container;
  readonly groundFx: Container;
  readonly units: Container;
  readonly overlays: Container;
  readonly flags: Container;
}

export interface StageRendererOptions {
  readonly canvas: HTMLCanvasElement;
  readonly camera: Camera;
  readonly width: number;
  readonly height: number;
}

interface ManagedSprite {
  readonly entityId: EntityId;
  readonly sprite: Sprite;
  readonly layer: Container;
}

/**
 * Owns the Pixi scene graph only. It consumes snapshots and never reads a World,
 * which keeps render timing and browser state out of the deterministic core.
 */
export class StageRenderer {
  readonly app: Application;
  readonly camera: Camera;
  readonly layers: RenderLayers;
  readonly terrain: TerrainChunkCache;
  readonly fog = new FogRenderer();
  readonly fx = new GroundFxRenderer();
  private readonly worldLayer = new Container();
  private readonly sprites = new Map<EntityId, ManagedSprite>();
  private readonly freeSprites: Sprite[] = [];

  private constructor(app: Application, camera: Camera, layers: RenderLayers) {
    this.app = app;
    this.camera = camera;
    this.layers = layers;
    this.terrain = new TerrainChunkCache(app.renderer, layers.terrain);
  }

  static async create(options: StageRendererOptions): Promise<StageRenderer> {
    const app = new Application();
    await app.init({
      canvas: options.canvas,
      width: options.width,
      height: options.height,
      backgroundColor: 0x0b0d14,
      antialias: false,
      autoDensity: true,
      resolution: 1,
    });

    const terrain = new Container();
    const fog = new Container();
    const depth = new Container({ sortableChildren: true });
    const groundFx = new Container();
    const overlays = new Container();
    const flags = new Container();
    const layers: RenderLayers = {
      terrain,
      fog,
      buildings: depth,
      groundFx,
      units: depth,
      overlays,
      flags,
    };
    const renderer = new StageRenderer(app, options.camera, layers);
    // Ground effects sit beneath the shared building/unit depth layer so decals never
    // make a moving unit look like it is walking through a wall.
    renderer.worldLayer.addChild(terrain, fog, groundFx, depth, overlays, flags);
    app.stage.addChild(renderer.worldLayer);
    renderer.applyCamera();
    return renderer;
  }

  resize(width: number, height: number): void {
    this.app.renderer.resize(width, height);
    this.camera.resize(width, height);
    this.applyCamera();
  }

  /** Bakes a map once; topology changes can invalidate only their 16×16 chunk. */
  setTerrain(map: TerrainMap, textureForTerrain: (terrain: string) => Texture): void {
    const chunksX = Math.ceil(map.width / 16);
    const chunksY = Math.ceil(map.height / 16);
    for (let cy = 0; cy < chunksY; cy++) {
      for (let cx = 0; cx < chunksX; cx++) {
        const origin = worldToScreen(cx * 16, cy * 16);
        this.terrain.ensure({ cx, cy }, origin.sx - 512, origin.sy);
      }
    }
    this.terrain.rebuild((container, chunk) => {
      const startX = chunk.cx * 16;
      const startY = chunk.cy * 16;
      for (let ty = startY; ty < Math.min(startY + 16, map.height); ty++) {
        for (let tx = startX; tx < Math.min(startX + 16, map.width); tx++) {
          const terrain = map.terrain[ty * map.width + tx];
          if (terrain === undefined) continue;
          const local = worldToScreen(tx - startX, ty - startY);
          const sprite = new Sprite(textureForTerrain(terrain));
          sprite.anchor.set(0.5, 0.5);
          sprite.position.set(512 + local.sx, 16 + local.sy);
          if (terrain === 'grass') sprite.tint = grassTint(tx, ty);
          container.addChild(sprite);
        }
      }
    });
  }

  /** Converts a DOM canvas point to the nearest tile centre for build previews. */
  tileAt(canvasX: number, canvasY: number): TileCoord {
    const screen = this.camera.screenToWorld(canvasX, canvasY);
    const world = screenToWorld(screen.x, screen.y);
    return { tx: Math.round(world.x), ty: Math.round(world.y) };
  }

  /** Projects a tile for DOM overlays; labels intentionally remain outside Pixi. */
  projectTile(tile: TileCoord): { x: number; y: number } | null {
    const world = worldToScreen(tile.tx, tile.ty);
    const point = this.camera.worldToScreen(world.sx, world.sy);
    return point.x < 0 ||
      point.y < 0 ||
      point.x > this.app.renderer.width ||
      point.y > this.app.renderer.height
      ? null
      : point;
  }

  /** Call once per visual frame after the simulation advances its fixed ticks. */
  draw(snapshot: Snapshot, alpha: number, textureForFrame: (frame: number) => Texture): void {
    const seen = new Set<EntityId>();
    const ordered: Array<{ entity: Entity; managed: ManagedSprite; x: number; y: number }> = [];
    for (const entity of snapshot.entities) {
      if (!entity.alive || entity.renderable === undefined) continue;
      seen.add(entity.id);
      const position = interpolatePosition(entity.transform, entity.renderable, alpha);
      const screen = worldToScreen(position.x, position.y);
      const managed = this.acquire(entity, textureForFrame(entity.renderable.frame));
      managed.sprite.visible = this.camera.containsWorld(screen.sx, screen.sy, 32);
      managed.sprite.position.set(screen.sx, screen.sy);
      managed.sprite.tint = entity.renderable.tint;
      if (entity.building !== undefined) {
        // Building materials are painted into the atlas. Applying an additional
        // class tint here muddies stone, timber, warm windows, and potion stalls.
        const scale =
          entity.building.kind === 'palace'
            ? 1.25
            : entity.building.kind === 'guardhouse'
              ? 0.78
              : 1;
        managed.sprite.scale.set(scale);
      } else {
        // The atlas renders only the east-facing half of the compass. Mirroring
        // the matching west-facing directions gives eight movement states without
        // doubling the art budget. Buildings and flags have no facing to mirror.
        const mirrored =
          entity.lair === undefined &&
          entity.flag === undefined &&
          MIRRORED_FACINGS.has(entity.transform.facing);
        managed.sprite.scale.set(mirrored ? -1 : 1, 1);
      }
      if (managed.layer === this.layers.buildings)
        ordered.push({ entity, managed, x: position.x, y: position.y });
    }

    for (const [id, managed] of this.sprites) {
      if (seen.has(id)) continue;
      managed.layer.removeChild(managed.sprite);
      this.sprites.delete(id);
      this.freeSprites.push(managed.sprite);
    }

    ordered.sort((a, b) =>
      compareDepth({ x: a.x, y: a.y, id: a.entity.id }, { x: b.x, y: b.y, id: b.entity.id }),
    );
    for (let index = 0; index < ordered.length; index++) {
      const item = ordered[index] as { managed: ManagedSprite };
      this.layers.buildings.setChildIndex(item.managed.sprite, index);
    }
    this.applyCamera();
  }

  destroy(): void {
    this.terrain.destroy();
    this.fog.clear(this.layers.fog);
    this.fx.clear(this.layers.groundFx);
    this.sprites.clear();
    this.freeSprites.length = 0;
    this.app.destroy(
      { removeView: false },
      { children: true, texture: false, textureSource: false },
    );
  }

  private acquire(entity: Entity, texture: Texture): ManagedSprite {
    const existing = this.sprites.get(entity.id);
    if (existing !== undefined) {
      existing.sprite.texture = texture;
      return existing;
    }
    const sprite = this.freeSprites.pop() ?? new Sprite(texture);
    sprite.texture = texture;
    sprite.anchor.set(0.5, 1);
    const layer = entity.kind === 'flag' ? this.layers.flags : this.layers.buildings;
    layer.addChild(sprite);
    const managed = { entityId: entity.id, sprite, layer };
    this.sprites.set(entity.id, managed);
    return managed;
  }

  private applyCamera(): void {
    const origin = this.camera.worldToScreen(0, 0);
    this.worldLayer.position.set(origin.x, origin.y);
    this.worldLayer.scale.set(this.camera.zoom);
  }

  /** Returns the nearest visible renderable under a canvas click, in tile units. */
  pick(snapshot: Snapshot, canvasX: number, canvasY: number): EntityId | null {
    const screen = this.camera.screenToWorld(canvasX, canvasY);
    const world = screenToWorld(screen.x, screen.y);
    let winner: Entity | null = null;
    let distance = Number.POSITIVE_INFINITY;
    for (const entity of snapshot.entities) {
      if (!entity.alive || entity.renderable === undefined) continue;
      const dx = entity.transform.x - world.x;
      const dy = entity.transform.y - world.y;
      const squared = dx * dx + dy * dy;
      if (
        squared < distance ||
        (squared === distance && (winner === null || entity.id < winner.id))
      ) {
        winner = entity;
        distance = squared;
      }
    }
    return distance <= 1.5 ? (winner?.id ?? null) : null;
  }
}

const GRASS_TINTS = [0xffffff, 0xf4fff1, 0xebf7df, 0xf8f0da, 0xe5f0d7] as const;

function grassTint(tx: number, ty: number): number {
  const hash = (Math.imul(tx, 73856093) ^ Math.imul(ty, 19349663)) >>> 0;
  return GRASS_TINTS[hash % GRASS_TINTS.length] as number;
}

/** Pointer drag plus trackpad/wheel zoom. The returned disposer prevents leaked listeners. */
export function attachCameraControls(
  canvas: HTMLCanvasElement,
  camera: Camera,
  onChange: () => void,
): () => void {
  let activePointer: number | null = null;
  let lastX = 0;
  let lastY = 0;
  const priorTouchAction = canvas.style.touchAction;
  canvas.style.touchAction = 'none';

  const down = (event: PointerEvent): void => {
    activePointer = event.pointerId;
    lastX = event.clientX;
    lastY = event.clientY;
    canvas.setPointerCapture(event.pointerId);
  };
  const move = (event: PointerEvent): void => {
    if (activePointer !== event.pointerId) return;
    camera.panBy(event.clientX - lastX, event.clientY - lastY);
    lastX = event.clientX;
    lastY = event.clientY;
    onChange();
  };
  const up = (event: PointerEvent): void => {
    if (activePointer !== event.pointerId) return;
    activePointer = null;
    if (canvas.hasPointerCapture(event.pointerId))
      canvas.releasePointerCapture(event.pointerId);
  };
  const wheel = (event: WheelEvent): void => {
    event.preventDefault();
    const rect = canvas.getBoundingClientRect();
    camera.zoomAt(
      event.deltaY < 0 ? 1.1 : 1 / 1.1,
      event.clientX - rect.left,
      event.clientY - rect.top,
    );
    onChange();
  };
  canvas.addEventListener('pointerdown', down);
  canvas.addEventListener('pointermove', move);
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('wheel', wheel, { passive: false });
  return () => {
    canvas.style.touchAction = priorTouchAction;
    canvas.removeEventListener('pointerdown', down);
    canvas.removeEventListener('pointermove', move);
    canvas.removeEventListener('pointerup', up);
    canvas.removeEventListener('pointercancel', up);
    canvas.removeEventListener('wheel', wheel);
  };
}
