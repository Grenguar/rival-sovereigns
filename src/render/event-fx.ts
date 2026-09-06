import type { Texture } from 'pixi.js';
import type { Snapshot } from '../core/types';
import { FRAMES } from './frames.gen';
import type { StageRenderer } from './stage';

/**
 * Turns simulation events into cosmetic ground effects.
 *
 * The renderer owns the effect lifetime in wall-clock time, so nothing here can
 * feed back into the fixed-step world. Call it once per simulation step rather
 * than once per frame: the world clears its event buffer at the top of every
 * step, so a frame that advances two ticks would otherwise lose the first one's.
 */
export function spawnEventFx(
  renderer: StageRenderer | null,
  snapshot: Snapshot,
  now: number,
  textureForFrame: (frame: number) => Texture,
): void {
  if (renderer === null || snapshot.events.length === 0) return;
  let positions: Map<number, { x: number; y: number }> | null = null;
  const positionOf = (id: number): { x: number; y: number } | undefined => {
    positions ??= new Map(
      snapshot.entities.map((e) => [e.id as number, { x: e.transform.x, y: e.transform.y }]),
    );
    return positions.get(id);
  };

  for (const event of snapshot.events) {
    if (event.t !== 'DEATH' && event.t !== 'BUILD_COMPLETE') continue;
    const at = positionOf(event.t === 'DEATH' ? event.entity : event.entity);
    // A death can retire its entity in the same tick that reports it.
    if (at === undefined) continue;
    const decal = event.t === 'DEATH';
    renderer.spawnFx(
      decal ? 'deathDecal' : 'constructionDust',
      at.x,
      at.y,
      textureForFrame(decal ? FRAMES.fx_decal : FRAMES.fx_dust),
      now,
    );
  }
}
