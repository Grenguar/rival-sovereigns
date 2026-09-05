import { Assets, type Spritesheet, type Texture } from 'pixi.js';
import { useEffect, useRef, useState } from 'react';
import { TICK_MS } from './core/world';
import { createScenario, MISSION_01 as MISSION } from './core/scenario';
import { worldToScreen } from './core/spatial/iso';
import { syncRenderables } from './render/frame-for';
import type { EntityId, Snapshot } from './core/types';
import { MISSION_01 } from './content/maps/mission-01';
import { FRAME_NAMES, FRAMES } from './render/frames.gen';
import { Camera } from './render/camera';
import { attachCameraControls, StageRenderer } from './render/stage';
import { HeroInspector } from './ui/HeroInspector';
import { Hud } from './ui/Hud';

export function App(): JSX.Element {
  const canvas = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<StageRenderer | null>(null);
  // The real thing: Mission 01 with every system installed in tick order, not a
  // hand-placed diorama. Heroes here actually score goals, plan and act.
  const world = useRef(createScenario({ seed: 20260905 }));
  const [snapshot, setSnapshot] = useState<Snapshot>(() => world.current.snapshot());
  const [selected, setSelected] = useState<EntityId | null>(null);
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
      // Open on the palace rather than the centre of the map.
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
      stopControls = attachCameraControls(element, camera, () => {
        const snap = world.current.snapshot();
        syncRenderables(snap.entities, world.current.tick);
        renderer?.draw(snap, 0, texture);
      });
      const resize = (): void => renderer?.resize(innerWidth, innerHeight);
      addEventListener('resize', resize);
      const loop = (now: number): void => {
        accumulator = Math.min(accumulator + now - last, TICK_MS * 5);
        last = now;
        while (accumulator >= TICK_MS) {
          world.current.step();
          accumulator -= TICK_MS;
          setSnapshot(world.current.snapshot());
        }
        const snap = world.current.snapshot();
        syncRenderables(snap.entities, world.current.tick);
        renderer?.draw(snap, accumulator / TICK_MS, texture);
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
  return (
    <main className="rs-game">
      <canvas
        ref={canvas}
        onClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          setSelected(
            rendererRef.current?.pick(
              snapshot,
              event.clientX - rect.left,
              event.clientY - rect.top,
            ) ?? null,
          );
        }}
      />
      <Hud snapshot={snapshot} onCommand={(command) => world.current.issue(command)} />
      <HeroInspector
        snapshot={snapshot}
        selectedHeroId={selected}
        onDismiss={() => setSelected(null)}
      />
    </main>
  );
}
