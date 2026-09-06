import { Application, Container, Sprite } from 'pixi.js';
import type { Texture } from 'pixi.js';
import type { Entity, EntityId, Snapshot, TileCoord } from '../core/types';
import { compareDepth, screenToWorld, worldToScreen } from '../core/spatial/iso';
import type { Camera } from './camera';
import { FogRenderer, isEntityVisible, type FogTile, type FogView } from './fog';
import { MIRRORED_FACINGS } from './frame-for';
import { GroundFxRenderer, type GroundFxKind } from './fx';
import { interpolatePosition } from './interpolate';
import { TerrainChunkCache } from './terrain';

export interface TerrainMap {
  readonly width: number;
  readonly height: number;
  readonly terrain: readonly string[];
}

export type RenderLayerName =
  | 'terrain'
  | 'landscape'
  | 'fog'
  | 'buildings'
  | 'groundFx'
  | 'units'
  | 'overlays'
  | 'flags';

export interface RenderLayers {
  readonly terrain: Container;
  readonly landscape: Container;
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
  private lastFogSync = '';

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
    const landscape = new Container({ sortableChildren: true });
    const fog = new Container();
    const depth = new Container({ sortableChildren: true });
    const groundFx = new Container();
    const overlays = new Container();
    const flags = new Container();
    const layers: RenderLayers = {
      terrain,
      landscape,
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
    renderer.worldLayer.addChild(terrain, landscape, fog, groundFx, depth, overlays, flags);
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
  setTerrain(
    map: TerrainMap,
    textureForTerrain: (terrain: string, tx: number, ty: number) => Texture,
    decorationForTerrain?: (terrain: string, tx: number, ty: number) => Texture | null,
  ): void {
    for (const child of this.layers.landscape.removeChildren()) child.destroy();
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
          const sprite = new Sprite(textureForTerrain(terrain, tx, ty));
          sprite.anchor.set(0.5, 0.5);
          sprite.position.set(512 + local.sx, 16 + local.sy);
          container.addChild(sprite);
          const decoration = decorationForTerrain?.(terrain, tx, ty) ?? null;
          if (decoration !== null) {
            const prop = new Sprite(decoration);
            const world = worldToScreen(tx, ty);
            prop.anchor.set(0.5, 1);
            prop.position.set(world.sx, world.sy);
            prop.zIndex = tx + ty;
            this.layers.landscape.addChild(prop);
          }
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

  /**
   * The fog tiles worth mounting a sprite for: those the camera can actually see.
   *
   * The grid is 9,216 tiles and most of a fresh map is unseen, so syncing all of it
   * would put thousands of sprites on the stage to draw a few hundred. The four
   * viewport corners project back to a tile-space bounding box.
   */
  /**
   * The tile-space bounding box the camera currently covers.
   *
   * Under the isometric projection a rectangular viewport is a diamond in tile
   * space, so this is the box around that diamond — deliberately generous. The
   * minimap draws it and the fog sync iterates it.
   */
  viewportTileBounds(): { minTx: number; minTy: number; maxTx: number; maxTy: number } {
    const corners = [
      [0, 0],
      [this.app.renderer.width, 0],
      [0, this.app.renderer.height],
      [this.app.renderer.width, this.app.renderer.height],
    ] as const;
    let minTx = Infinity;
    let maxTx = -Infinity;
    let minTy = Infinity;
    let maxTy = -Infinity;
    for (const [px, py] of corners) {
      const stage = this.camera.screenToWorld(px, py);
      const tile = screenToWorld(stage.x, stage.y);
      minTx = Math.min(minTx, tile.x);
      maxTx = Math.max(maxTx, tile.x);
      minTy = Math.min(minTy, tile.y);
      maxTy = Math.max(maxTy, tile.y);
    }
    return { minTx, minTy, maxTx, maxTy };
  }

  private visibleFog(view: FogView): FogTile[] {
    const { minTx, minTy, maxTx, maxTy } = this.viewportTileBounds();
    const tiles: FogTile[] = [];
    const x0 = Math.max(0, Math.floor(minTx) - 1);
    const x1 = Math.min(view.width - 1, Math.ceil(maxTx) + 1);
    const y0 = Math.max(0, Math.floor(minTy) - 1);
    const y1 = Math.min(view.height - 1, Math.ceil(maxTy) + 1);
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        const state = view.at(tx, ty);
        if (state === 2) continue;
        tiles.push({ tile: { tx, ty }, state });
      }
    }
    return tiles;
  }

  /**
   * Spawns a ground effect at a world tile. Purely cosmetic: the effect's
   * lifetime is wall-clock and never re-enters the simulation.
   */
  spawnFx(kind: GroundFxKind, x: number, y: number, texture: Texture, now: number): void {
    const screen = worldToScreen(x, y);
    this.fx.spawn(this.layers.groundFx, texture, screen.sx, screen.sy, kind, now);
  }

  /** Call once per visual frame after the simulation advances its fixed ticks. */
  draw(
    snapshot: Snapshot,
    alpha: number,
    textureForFrame: (frame: number) => Texture,
    fog?: { readonly view: FogView; readonly texture: Texture },
  ): void {
    this.fx.update(this.layers.groundFx, performance.now());
    if (fog !== undefined) {
      const view = this.camera.view;
      // Thousands of fog diamonds are static between simulation ticks and camera
      // changes. Rebuilding their live set at display refresh rate made a minimap
      // round trip stall the browser; this key keeps the exact same result at 10 Hz.
      const fogSync = [snapshot.tick, view.x, view.y, view.zoom, view.width, view.height].join(':');
      if (fogSync !== this.lastFogSync) {
        this.fog.sync(this.layers.fog, this.visibleFog(fog.view), fog.texture);
        this.lastFogSync = fogSync;
      }
    }
    const seen = new Set<EntityId>();
    const ordered: Array<{ entity: Entity; managed: ManagedSprite; x: number; y: number }> = [];
    for (const entity of snapshot.entities) {
      if (!entity.alive || entity.renderable === undefined) continue;
      if (
        fog !== undefined &&
        !isEntityVisible(
          fog.view,
          entity.faction,
          entity.building !== undefined || entity.lair !== undefined,
          entity.transform.x,
          entity.transform.y,
        )
      ) {
        continue;
      }
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
    for (const child of this.layers.landscape.removeChildren()) child.destroy();
    this.fog.clear(this.layers.fog);
    this.lastFogSync = '';
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
  // ── Keyboard ───────────────────────────────────────────────────────────────
  // Held keys are integrated per frame rather than acted on per keydown event, so
  // pan speed follows the display and not the OS key-repeat rate.
  const held = new Set<string>();
  let panFrame = 0;
  let lastPan = 0;

  const stepPan = (nowMs: number): void => {
    const elapsed = Math.min(nowMs - lastPan, 100);
    lastPan = nowMs;
    let dx = 0;
    let dy = 0;
    if (held.has('left')) dx += 1;
    if (held.has('right')) dx -= 1;
    if (held.has('up')) dy += 1;
    if (held.has('down')) dy -= 1;
    if (dx !== 0 || dy !== 0) {
      const speed = (KEYBOARD_PAN_PX_PER_SECOND * elapsed) / 1000;
      camera.panBy(dx * speed, dy * speed);
      onChange();
    }
    panFrame = held.size === 0 ? 0 : requestAnimationFrame(stepPan);
  };
  const startPanning = (): void => {
    if (panFrame !== 0) return;
    lastPan = performance.now();
    panFrame = requestAnimationFrame(stepPan);
  };

  const keydown = (event: KeyboardEvent): void => {
    // The tax slider, the build menu and the minimap all handle their own arrow
    // keys. preventDefault on their side does not stop this window-level listener,
    // so a focused minimap would survey and pan the camera at the same time.
    if (ownsArrowKeys(event.target)) return;
    const direction = PAN_KEYS[event.key];
    if (direction !== undefined) {
      event.preventDefault();
      held.add(direction);
      startPanning();
      return;
    }
    if (event.key === '+' || event.key === '=') {
      event.preventDefault();
      camera.zoomBy(KEYBOARD_ZOOM_STEP);
      onChange();
    } else if (event.key === '-' || event.key === '_') {
      event.preventDefault();
      camera.zoomBy(1 / KEYBOARD_ZOOM_STEP);
      onChange();
    }
  };
  const keyup = (event: KeyboardEvent): void => {
    const direction = PAN_KEYS[event.key];
    if (direction !== undefined) held.delete(direction);
  };
  // Alt-tabbing away with a key down otherwise leaves the map scrolling forever.
  const blur = (): void => held.clear();

  canvas.addEventListener('pointerdown', down);
  canvas.addEventListener('pointermove', move);
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('wheel', wheel, { passive: false });
  addEventListener('keydown', keydown);
  addEventListener('keyup', keyup);
  addEventListener('blur', blur);
  return () => {
    canvas.style.touchAction = priorTouchAction;
    canvas.removeEventListener('pointerdown', down);
    canvas.removeEventListener('pointermove', move);
    canvas.removeEventListener('pointerup', up);
    canvas.removeEventListener('pointercancel', up);
    canvas.removeEventListener('wheel', wheel);
    removeEventListener('keydown', keydown);
    removeEventListener('keyup', keyup);
    removeEventListener('blur', blur);
    if (panFrame !== 0) cancelAnimationFrame(panFrame);
  };
}

/** Screen pixels per second of keyboard panning, independent of key-repeat rate. */
const KEYBOARD_PAN_PX_PER_SECOND = 900;
const KEYBOARD_ZOOM_STEP = 1.2;

const PAN_KEYS: Readonly<Record<string, string | undefined>> = {
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ArrowUp: 'up',
  ArrowDown: 'down',
  a: 'left',
  A: 'left',
  d: 'right',
  D: 'right',
  w: 'up',
  W: 'up',
  s: 'down',
  S: 'down',
};

/**
 * Whether the focused element has already claimed the arrow keys.
 *
 * An explicit tabindex is the honest signal: it is how an element declares itself
 * keyboard-interactive. The Pixi canvas has none, so panning still works whenever
 * focus is nowhere in particular.
 */
function ownsArrowKeys(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (target.hasAttribute('tabindex')) return true;
  // Deliberately not buttons: nothing in this UI navigates a button with arrows,
  // and clicking Pause should not silently disable panning.
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}
