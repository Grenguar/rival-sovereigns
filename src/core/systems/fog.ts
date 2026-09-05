/**
 * A19/A20 — fog and per-hero knowledge. Tick phase 13.
 *
 * Heroes are not omniscient: each carries a personal set of known lairs and can only
 * path to something it knows about. This is what lets an unexplored corner quietly
 * incubate a lair for ten minutes, and what gives rangers structural value beyond
 * damage — docs/01-game-design.md §9.
 */

import { FOG_EXPLORED, FOG_UNSEEN, FOG_VISIBLE, type FogState } from '../types';
import type { World } from '../world';
import { CLASSES } from '../../content/classes';

export interface Fog {
  readonly width: number;
  readonly height: number;
  /** One byte per tile: unseen | explored (remembered, stale) | visible. */
  readonly tiles: Uint8Array;
  /**
   * Unseen tiles adjacent to something seen — the actual edge of the known world.
   *
   * Computed once per refresh for everybody rather than searched per agent. An
   * earlier version sampled eight directions per agent and kept landing on already-
   * explored corridors, so heroes concluded the map was fully explored and idled in
   * the middle of a mostly-black 96x96 map.
   */
  frontier: { tx: number; ty: number }[];
}

const KEY = 'fog';

export function fogOf(w: World, width = 96, height = 96): Fog {
  let fog = w.systemState.get(KEY) as Fog | undefined;
  if (fog === undefined) {
    fog = { width, height, tiles: new Uint8Array(width * height), frontier: [] };
    w.systemState.set(KEY, fog);
  }
  return fog;
}

export function fogAt(fog: Fog, tx: number, ty: number): FogState {
  if (tx < 0 || ty < 0 || tx >= fog.width || ty >= fog.height) return FOG_UNSEEN;
  return (fog.tiles[ty * fog.width + tx] ?? FOG_UNSEEN) as FogState;
}

export const fogSystem = (w: World): void => {
  const fog = fogOf(w);

  // Everything currently visible decays to explored; this tick's sweep re-lights it.
  // Explored is remembered but stale, which is exactly what the renderer tints.
  for (let i = 0; i < fog.tiles.length; i++) {
    if (fog.tiles[i] === FOG_VISIBLE) fog.tiles[i] = FOG_EXPLORED;
  }

  for (const e of w.views.agents) {
    if (e.faction !== 'crown' || !e.alive) continue;
    const radius = CLASSES[e.agent?.classId ?? '']?.visionRadius ?? 4;
    const cx = Math.round(e.transform.x);
    const cy = Math.round(e.transform.y);
    const r2 = radius * radius;

    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (dx * dx + dy * dy > r2) continue;
        const tx = cx + dx;
        const ty = cy + dy;
        if (tx < 0 || ty < 0 || tx >= fog.width || ty >= fog.height) continue;
        fog.tiles[ty * fog.width + tx] = FOG_VISIBLE;
      }
    }

    // A hero that can see a lair remembers it, and can then path to it.
    const agent = e.agent;
    if (agent === undefined) continue;
    for (const lair of w.views.lairs) {
      if (!lair.alive) continue;
      const lx = lair.transform.x - e.transform.x;
      const ly = lair.transform.y - e.transform.y;
      if (lx * lx + ly * ly <= r2) agent.blackboard.knownLairs.add(lair.id);
    }
  }

  if (w.tick % FRONTIER_REFRESH === 0) recomputeFrontier(fog);
};

/** How often the frontier list is rebuilt, in ticks. */
export const FRONTIER_REFRESH = 10;

/**
 * An unseen tile touching a seen one. Scanned in row-major order, so the list — and
 * therefore every hero's choice of where to go next — is identical on every engine.
 */
export function recomputeFrontier(fog: Fog): void {
  const out: { tx: number; ty: number }[] = [];
  const { width, height, tiles } = fog;

  for (let ty = 0; ty < height; ty++) {
    for (let tx = 0; tx < width; tx++) {
      if (tiles[ty * width + tx] !== FOG_UNSEEN) continue;
      const seenNeighbour =
        (tx > 0 && tiles[ty * width + tx - 1] !== FOG_UNSEEN) ||
        (tx + 1 < width && tiles[ty * width + tx + 1] !== FOG_UNSEEN) ||
        (ty > 0 && tiles[(ty - 1) * width + tx] !== FOG_UNSEEN) ||
        (ty + 1 < height && tiles[(ty + 1) * width + tx] !== FOG_UNSEEN);
      if (seenNeighbour) out.push({ tx, ty });
    }
  }
  fog.frontier = out;
}

/**
 * A20 — knowledge exchange at the inn. Any two co-located heroes merge their known
 * sets, which is the Inn's mechanical reason to exist beyond healing.
 */
export const innKnowledgeSystem = (w: World): void => {
  const inns = w.views.buildings.filter((b) => b.building?.kind === 'inn' && b.alive);
  if (inns.length === 0) return;

  for (const inn of inns) {
    const present = w.views.agents.filter((e) => {
      if (e.kind !== 'hero' || !e.alive) return false;
      const dx = e.transform.x - inn.transform.x;
      const dy = e.transform.y - inn.transform.y;
      return dx * dx + dy * dy <= 9;
    });
    if (present.length < 2) continue;

    const merged = new Set<number>();
    for (const e of present) for (const id of e.agent?.blackboard.knownLairs ?? []) merged.add(id);
    for (const e of present) {
      const bb = e.agent?.blackboard;
      if (bb === undefined) continue;
      for (const id of merged) bb.knownLairs.add(id as never);
    }
  }
};
