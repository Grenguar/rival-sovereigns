/**
 * Which sprite draws a given entity.
 *
 * Lives in render/ on purpose: frame indices are a drawing concern, and putting them
 * in core would make the simulation depend on the atlas. The core never knows a
 * sprite exists — it only knows the entity is a damaged blacksmith facing south-east.
 */

import type { Entity } from '../core/types';
import { FRAMES, type FrameName } from './frames.gen';

const has = (name: string): name is FrameName => name in FRAMES;

/** Buildings and lairs read their condition off health and the building state. */
function structureState(e: Entity): 'construction' | 'intact' | 'damaged' | 'rubble' {
  if (!e.alive) return 'rubble';
  if (e.building?.state === 'underConstruction') return 'construction';
  const h = e.health;
  if (h !== undefined && h.maxHp > 0 && h.hp / h.maxHp < 0.5) return 'damaged';
  return 'intact';
}

/**
 * Walk frames advance on tick, not on wall clock.
 *
 * Frame-delta animation desynchronises visuals from simulation state, the same
 * reason positions interpolate by tick alpha — docs/02-architecture.md §8.
 */
function unitFrame(kind: string, e: Entity, tick: number): string {
  const moving = e.movement?.destination != null;
  const attacking = e.combat !== undefined && e.combat.target.index >= 0 && !moving;

  if (attacking) return `${kind}_attack_s_${String(Math.floor(tick / 6) % 2).padStart(2, '0')}`;
  if (moving) return `${kind}_walk_s_${String(Math.floor(tick / 2) % 4).padStart(2, '0')}`;
  return `${kind}_idle_s_00`;
}

/** The frame index for an entity, or null when it should not be drawn. */
export function frameFor(e: Entity, tick: number): number | null {
  let name: string | null = null;

  if (e.building !== undefined) {
    name = `${e.building.kind}_${structureState(e)}`;
  } else if (e.lair !== undefined) {
    const state = structureState(e);
    // Lairs have no construction phase — they are simply there.
    name = `${e.lair.kind}_${state === 'construction' ? 'intact' : state}`;
  } else if (e.flag !== undefined) {
    name = `flag_${e.flag.kind}`;
  } else if (e.fsm !== undefined) {
    name = unitFrame(e.fsm.kind, e, tick);
  } else if (e.agent !== undefined) {
    name = unitFrame(e.agent.classId, e, tick);
  }

  if (name === null || !has(name)) return null;
  return FRAMES[name];
}

/**
 * Gives every drawable entity a renderable, and keeps it current.
 *
 * Called from the render loop rather than from a spawn hook so that entities created
 * by any system — a guild recruiting, a lair spawning a wave — are picked up without
 * every system having to remember the renderer exists.
 */
export function syncRenderables(entities: readonly Entity[], tick: number): void {
  for (const e of entities) {
    const frame = frameFor(e, tick);
    if (frame === null) {
      if (e.renderable !== undefined) e.renderable = undefined;
      continue;
    }
    if (e.renderable === undefined) {
      e.renderable = { frame, tint: 0xffffff, prevX: e.transform.x, prevY: e.transform.y };
    } else {
      e.renderable.frame = frame;
    }
  }
}
