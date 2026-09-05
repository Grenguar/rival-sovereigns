import { Assets, type Spritesheet, type Texture } from 'pixi.js';
import { useEffect, useRef, useState } from 'react';
import { World, TICK_MS } from './core/world';
import type { EntityId, Snapshot } from './core/types';
import { FRAME_NAMES, FRAMES } from './render/frames.gen';
import { Camera } from './render/camera';
import { attachCameraControls, StageRenderer } from './render/stage';
import { HeroInspector } from './ui/HeroInspector';
import { Hud } from './ui/Hud';

function demoWorld(): World {
  const world = new World(20260905);
  const entries: Array<[keyof typeof FRAMES, number, number, 'hero' | 'monster' | 'building', 'crown' | 'monsters']> = [
    ['palace_intact', 46, 49, 'building', 'crown'], ['warrior_idle_s_00', 42, 47, 'hero', 'crown'], ['ranger_idle_s_00', 48, 45, 'hero', 'crown'], ['rogue_idle_s_00', 45, 52, 'hero', 'crown'], ['ratkin_idle_s_00', 56, 42, 'monster', 'monsters'], ['goblin_idle_s_00', 62, 39, 'monster', 'monsters'],
  ];
  for (const [frame, x, y, kind, faction] of entries) { const entity = world.spawn({ kind, faction, x, y }); entity.renderable = { frame: FRAMES[frame], tint: 0xffffff, prevX: x, prevY: y }; if (kind === 'hero') entity.agent = { entity: entity.handle, classId: frame.startsWith('warrior') ? 'warrior' : frame.startsWith('ranger') ? 'ranger' : 'rogue', name: frame.split('_')[0] as string, traits: { greed: 1, courage: 1, curiosity: 1, loyalty: 1 }, currentGoal: null, goalScores: [], plan: null, currentState: { values: 0, mask: 0 }, blackboard: { visibleEnemies: [], nearestThreat: { index: -1, generation: -1 }, nearestShop: { market: { index: -1, generation: -1 }, smith: { index: -1, generation: -1 }, inn: { index: -1, generation: -1 } }, homeGuild: { index: -1, generation: -1 }, knownLairs: new Set(), knownFlags: [], currentTarget: { index: -1, generation: -1 }, lastDamageFrom: { index: -1, generation: -1 }, frontierTile: null, sensorDue: {} }, nextGoalTick: 0, nextPlanTick: 0, history: [], idleSinceTick: 0 }; }
  return world;
}

export function App(): JSX.Element {
  const canvas = useRef<HTMLCanvasElement>(null); const rendererRef = useRef<StageRenderer | null>(null); const world = useRef(demoWorld()); const [snapshot, setSnapshot] = useState<Snapshot>(() => world.current.snapshot()); const [selected, setSelected] = useState<EntityId | null>(null);
  useEffect(() => { let disposed = false; let renderer: StageRenderer | null = null; let stopControls = () => {}; let frame = 0; let last = performance.now(); let accumulator = 0;
    void (async () => { const element = canvas.current; if (element === null) return; const sheet = await Assets.load<Spritesheet>('/atlas/game.json'); if (disposed) return; const camera = new Camera({ minX: -3072, minY: 0, maxX: 3072, maxY: 3072 }, innerWidth, innerHeight); renderer = await StageRenderer.create({ canvas: element, camera, width: innerWidth, height: innerHeight }); rendererRef.current = renderer; const texture = (index: number): Texture => sheet.textures[FRAME_NAMES[index] as string] as Texture; stopControls = attachCameraControls(element, camera, () => renderer?.draw(world.current.snapshot(), 0, texture)); const resize = (): void => renderer?.resize(innerWidth, innerHeight); addEventListener('resize', resize); const loop = (now: number): void => { accumulator = Math.min(accumulator + now - last, TICK_MS * 5); last = now; while (accumulator >= TICK_MS) { world.current.step(); accumulator -= TICK_MS; setSnapshot(world.current.snapshot()); } renderer?.draw(world.current.snapshot(), accumulator / TICK_MS, texture); frame = requestAnimationFrame(loop); }; frame = requestAnimationFrame(loop); })(); return () => { disposed = true; cancelAnimationFrame(frame); stopControls(); rendererRef.current = null; renderer?.destroy(); }; }, []);
  return <main className="rs-game"><canvas ref={canvas} onClick={(event) => { const rect = event.currentTarget.getBoundingClientRect(); setSelected(rendererRef.current?.pick(snapshot, event.clientX - rect.left, event.clientY - rect.top) ?? null); }} /><Hud snapshot={snapshot} onCommand={(command) => world.current.issue(command)} /><HeroInspector snapshot={snapshot} selectedHeroId={selected} onDismiss={() => setSelected(null)} /></main>;
}
