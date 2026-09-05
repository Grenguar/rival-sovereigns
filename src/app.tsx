import { Assets, type Spritesheet, type Texture } from 'pixi.js';
import { useEffect, useRef, useState } from 'react';
import { PLACEABLE } from './content/buildings';
import { MISSION_01, terrainAt } from './content/maps/mission-01';
import { createScenario, MISSION_01 as MISSION } from './core/scenario';
import { worldToScreen } from './core/spatial/iso';
import type {
  BuildingKind,
  Command,
  EntityId,
  Handle,
  Snapshot,
  TileCoord,
} from './core/types';
import { TICK_MS } from './core/world';
import { Camera } from './render/camera';
import { FRAME_NAMES, FRAMES } from './render/frames.gen';
import { syncRenderables } from './render/frame-for';
import { attachCameraControls, StageRenderer } from './render/stage';
import { ActionBar, flagKindForMode, type InteractionMode } from './ui/ActionBar';
import { BuildMenu, type BuildingPlacement } from './ui/BuildMenu';
import { EndScreen } from './ui/EndScreen';
import { EventOverlay } from './ui/EventOverlay';
import { FlagLabels } from './ui/FlagLabels';
import { FlagTool } from './ui/FlagTool';
import { HeroInspector } from './ui/HeroInspector';
import { Hud } from './ui/Hud';
import { WorldLabels } from './ui/WorldLabels';

const BUILD_OPTIONS = PLACEABLE.map((building) => ({
  kind: building.id,
  label: building.label,
  cost: building.cost,
  requiredPalaceLevel: building.requiresPalaceLevel,
}));

function placementFor(
  snapshot: Snapshot,
  kind: BuildingKind | null,
  tile: TileCoord | null,
): BuildingPlacement {
  if (kind === null || tile === null) return { tile, valid: false, reason: null };
  const def = PLACEABLE.find((building) => building.id === kind);
  if (def === undefined) return { tile, valid: false, reason: 'That building is unavailable.' };
  const footprint: TileCoord[] = [];
  for (let dy = 0; dy < def.footprint.h; dy++)
    for (let dx = 0; dx < def.footprint.w; dx++)
      footprint.push({ tx: tile.tx + dx, ty: tile.ty + dy });
  if (footprint.some((cell) => terrainAt(MISSION_01, cell.tx, cell.ty) !== 'grass'))
    return { tile, valid: false, reason: 'Foundations need clear grass.' };
  if (
    footprint.some((cell) =>
      snapshot.entities.some(
        (entity) =>
          entity.alive &&
          entity.building?.footprint.some(
            (occupied) => occupied.tx === cell.tx && occupied.ty === cell.ty,
          ),
      ),
    )
  )
    return { tile, valid: false, reason: 'Another building occupies that tile.' };
  return { tile, valid: true, reason: null };
}

export function App(): JSX.Element {
  const canvas = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<StageRenderer | null>(null);
  const world = useRef(createScenario({ seed: 20260905 }));
  const pausedRef = useRef(false);
  const [snapshot, setSnapshot] = useState<Snapshot>(() => world.current.snapshot());
  const [selected, setSelected] = useState<EntityId | null>(null);
  const [mode, setMode] = useState<InteractionMode>('inspect');
  const [buildKind, setBuildKind] = useState<BuildingKind | null>(null);
  const [placementTile, setPlacementTile] = useState<TileCoord | null>(null);
  const [flagTarget, setFlagTarget] = useState<Handle | TileCoord | null>(null);
  const [paused, setPaused] = useState(false);
  const [, setCameraVersion] = useState(0);
  const setPause = (next: boolean): void => {
    pausedRef.current = next;
    setPaused(next);
  };
  const issue = (command: Command): void => {
    world.current.issue(command);
    if (command.t === 'PLACE_BUILDING') {
      setBuildKind(null);
      setPlacementTile(null);
      setMode('inspect');
    }
    if (command.t === 'PLACE_FLAG') {
      setFlagTarget(null);
      setMode('inspect');
    }
  };
  const projectTile = (tile: TileCoord): { x: number; y: number } | null =>
    rendererRef.current?.projectTile(tile) ?? null;
  const projectEntity = (id: EntityId): { x: number; y: number } | null => {
    const entity = snapshot.entities.find((candidate) => candidate.id === id);
    return entity === undefined
      ? null
      : projectTile({ tx: entity.transform.x, ty: entity.transform.y });
  };

  useEffect(() => {
    let disposed = false;
    let renderer: StageRenderer | null = null;
    let stopControls = () => {};
    let frame = 0;
    let last = performance.now();
    let accumulator = 0;
    void (async () => {
      const element = canvas.current;
      if (element === null) return;
      const sheet = await Assets.load<Spritesheet>('/atlas/game.json');
      if (disposed) return;
      const camera = new Camera(
        { minX: -3072, minY: 0, maxX: 3072, maxY: 3072 },
        innerWidth,
        innerHeight,
      );
      renderer = await StageRenderer.create({
        canvas: element,
        camera,
        width: innerWidth,
        height: innerHeight,
      });
      rendererRef.current = renderer;
      const palace = worldToScreen(MISSION.palace.tx, MISSION.palace.ty);
      camera.centerOn(palace.sx, palace.sy);
      const texture = (index: number): Texture =>
        sheet.textures[FRAME_NAMES[index] as string] as Texture;
      const terrainFrames: Record<string, keyof typeof FRAMES> = {
        grass: 'terrain_grass',
        forest: 'terrain_forest',
        water: 'terrain_water',
        rock: 'terrain_rock',
        road: 'terrain_road',
      };
      renderer.setTerrain(MISSION_01, (terrain) =>
        texture(FRAMES[terrainFrames[terrain] ?? 'terrain_grass']),
      );
      stopControls = attachCameraControls(element, camera, () =>
        setCameraVersion((version) => version + 1),
      );
      const resize = (): void => renderer?.resize(innerWidth, innerHeight);
      addEventListener('resize', resize);
      const loop = (now: number): void => {
        accumulator = Math.min(accumulator + now - last, TICK_MS * 5);
        last = now;
        while (!pausedRef.current && accumulator >= TICK_MS) {
          world.current.step();
          accumulator -= TICK_MS;
          setSnapshot(world.current.snapshot());
        }
        const snap = world.current.snapshot();
        syncRenderables(snap.entities, world.current.tick);
        renderer?.draw(snap, pausedRef.current ? 0 : accumulator / TICK_MS, texture);
        frame = requestAnimationFrame(loop);
      };
      frame = requestAnimationFrame(loop);
    })();
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      stopControls();
      rendererRef.current = null;
      renderer?.destroy();
    };
  }, []);

  const placement = placementFor(snapshot, buildKind, placementTile);
  const placementPoint = placement.tile === null ? null : projectTile(placement.tile);
  const activeFlagId =
    selected === null
      ? null
      : snapshot.entities.find((entity) => entity.id === selected)?.flag === undefined
        ? null
        : selected;
  const flagKind = flagKindForMode(mode);
  const restart = (): void => {
    world.current = createScenario({ seed: 20260905 });
    setSnapshot(world.current.snapshot());
    setSelected(null);
    setMode('inspect');
    setBuildKind(null);
    setFlagTarget(null);
    setPause(false);
  };

  return (
    <main className="rs-game">
      <canvas
        ref={canvas}
        onClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          const x = event.clientX - rect.left;
          const y = event.clientY - rect.top;
          const renderer = rendererRef.current;
          if (renderer === null) return;
          const picked = renderer.pick(snapshot, x, y);
          if (mode === 'build') {
            setPlacementTile(renderer.tileAt(x, y));
            return;
          }
          if (mode === 'explore') {
            setFlagTarget(renderer.tileAt(x, y));
            return;
          }
          if (mode === 'attack') {
            const entity =
              picked === null
                ? null
                : snapshot.entities.find((candidate) => candidate.id === picked);
            setFlagTarget(entity?.handle ?? null);
            return;
          }
          setSelected(picked);
        }}
      />
      <Hud snapshot={snapshot} onCommand={issue} />
      <ActionBar
        buildKind={buildKind}
        mode={mode}
        onBuildKindChange={setBuildKind}
        onModeChange={(next) => {
          setMode(next);
          setPlacementTile(null);
          setFlagTarget(null);
        }}
        onPause={() => setPause(true)}
      />
      {mode === 'build' ? (
        <BuildMenu
          onCommand={issue}
          onSelect={setBuildKind}
          options={BUILD_OPTIONS}
          placement={placement}
          selected={buildKind}
          snapshot={snapshot}
        />
      ) : null}
      {mode === 'build' && placementPoint !== null ? (
        <span
          aria-hidden="true"
          className={`rs-build-preview ${placement.valid ? 'rs-build-preview--valid' : 'rs-build-preview--invalid'}`}
          style={{ left: placementPoint.x, top: placementPoint.y }}
        />
      ) : null}
      {flagKind !== null || activeFlagId !== null ? (
        <FlagTool
          activeFlagId={activeFlagId}
          kind={flagKind ?? 'attack'}
          onCommand={issue}
          snapshot={snapshot}
          target={flagTarget}
        />
      ) : null}
      <FlagLabels projectTile={projectTile} snapshot={snapshot} />
      <EventOverlay projectEntity={projectEntity} snapshot={snapshot} />
      <WorldLabels projectEntity={projectEntity} selectedId={selected} snapshot={snapshot} />
      <HeroInspector
        snapshot={snapshot}
        selectedHeroId={selected}
        onDismiss={() => setSelected(null)}
      />
      <EndScreen
        onPauseChange={setPause}
        onRestart={restart}
        paused={paused}
        snapshot={snapshot}
      />
    </main>
  );
}
