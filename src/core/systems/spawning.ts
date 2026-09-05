/**
 * A11 — guilds, recruit costs, caps and timers. Tick phase 10.
 *
 * A guild spawns one hero every 40 s while below cap, and each spawn costs the
 * recruit fee. If the treasury cannot pay, the spawn is skipped and retried rather
 * than queued — docs/01-game-design.md §5. That is what makes a poor kingdom feel
 * poor instead of silently accruing debt.
 */

import type { Entity, ClassId, HenchmanKind } from '../types';
import type { World } from '../world';
import { BUILDINGS } from '../../content/buildings';
import { CLASSES } from '../../content/classes';
import { HENCHMEN } from '../../content/monsters';
import { GUILD_CAP_BY_PALACE_LEVEL, PALACE_L2_THRESHOLD } from '../../content/balance';
import { createHenchman, createHero, createMonster } from '../factory';
import { LAIRS } from '../../content/monsters';

/** Hero cap per guild, by palace level — 3 at L1, 5 at L2. */
export function guildCap(palaceLevel: number): number {
  return GUILD_CAP_BY_PALACE_LEVEL[palaceLevel - 1] ?? GUILD_CAP_BY_PALACE_LEVEL[0];
}

function countHeroes(w: World, classId: ClassId): number {
  let n = 0;
  for (const e of w.views.agents) if (e.kind === 'hero' && e.agent?.classId === classId) n++;
  return n;
}

function countHenchmen(w: World, kind: HenchmanKind): number {
  let n = 0;
  for (const e of w.entitiesInIdOrder()) if (e.alive && e.fsm?.kind === kind) n++;
  return n;
}

const nextTo = (b: Entity) => ({ tx: Math.round(b.transform.x) + 1, ty: Math.round(b.transform.y) + 1 });

export const spawningSystem = (w: World): void => {
  // Crown revenue, not tax alone — see PALACE_L2_THRESHOLD for why.
  if (w.palaceLevel < 2 && w.taxCollected + w.shopRevenue >= PALACE_L2_THRESHOLD) {
    w.palaceLevel = 2;
  }

  for (const b of w.views.buildings) {
    const building = b.building;
    if (building === undefined || !b.alive || building.state === 'underConstruction') continue;

    if (building.kind === 'palace') {
      stepPalace(w, b);
      continue;
    }

    const def = BUILDINGS[building.kind];
    if (def?.spawns == null || def.spawnInterval <= 0) continue;

    building.spawnCooldown -= 1;
    if (building.spawnCooldown > 0) continue;

    if (def.spawns === 'guard') {
      if (countGuardsFor(w, b) >= (HENCHMEN.guard?.cap ?? 2)) {
        building.spawnCooldown = def.spawnInterval;
        continue;
      }
      createHenchman(w, 'guard', nextTo(b), { tx: Math.round(b.transform.x), ty: Math.round(b.transform.y) });
      building.spawnCooldown = def.spawnInterval;
      continue;
    }

    const classId = def.spawns as ClassId;
    const cls = CLASSES[classId];
    if (cls === undefined) continue;

    if (countHeroes(w, classId) >= guildCap(w.palaceLevel)) {
      building.spawnCooldown = def.spawnInterval;
      continue;
    }
    if (w.treasury < cls.recruitCost) {
      // Retry on the next tick rather than after another full interval — a kingdom
      // that just became solvent should hire immediately.
      building.spawnCooldown = 1;
      continue;
    }

    w.treasury -= cls.recruitCost;
    const hero = createHero(w, classId, nextTo(b));
    if (hero?.agent !== undefined) hero.agent.blackboard.homeGuild = b.handle;
    building.spawnCooldown = def.spawnInterval;
  }

  stepLairs(w);
};

function countGuardsFor(w: World, guardhouse: Entity): number {
  const px = Math.round(guardhouse.transform.x);
  const py = Math.round(guardhouse.transform.y);
  let n = 0;
  for (const e of w.entitiesInIdOrder()) {
    if (!e.alive || e.fsm?.kind !== 'guard') continue;
    if (e.fsm.post?.tx === px && e.fsm.post.ty === py) n++;
  }
  return n;
}

/** The palace keeps peasants and tax collectors topped up, free of charge. */
function stepPalace(w: World, palace: Entity): void {
  const building = palace.building;
  if (building === undefined) return;

  building.spawnCooldown -= 1;
  if (building.spawnCooldown > 0) return;
  building.spawnCooldown = HENCHMEN.peasant?.replaceDelay ?? 150;

  if (countHenchmen(w, 'peasant') < (HENCHMEN.peasant?.cap ?? 4)) {
    createHenchman(w, 'peasant', nextTo(palace));
    return;
  }
  if (countHenchmen(w, 'taxCollector') < (HENCHMEN.taxCollector?.cap ?? 2)) {
    createHenchman(w, 'taxCollector', nextTo(palace));
  }
}

/**
 * A17 — waves. The spawn interval shrinks 5% per wave, floored at 60% of base, and
 * the pressure curve emerges from that rule rather than a scripted timeline.
 */
function stepLairs(w: World): void {
  for (const e of w.views.lairs) {
    const lair = e.lair;
    if (lair === undefined || !e.alive) continue;
    if (w.tick < lair.nextSpawnTick) continue;

    const def = LAIRS[lair.kind];
    if (def === undefined) continue;

    lair.wave += 1;
    if (lair.wave > w.wave) w.wave = lair.wave;

    for (const entry of def.spawns) {
      if (lair.wave < entry.fromWave) continue;
      for (let i = 0; i < entry.count; i++) {
        createMonster(w, entry.monster, {
          tx: Math.round(e.transform.x) + (i % 2),
          ty: Math.round(e.transform.y) + 1,
        });
      }
    }

    const shrink = 1 - def.escalationPerWave * lair.wave;
    const factor = shrink < def.escalationFloor ? def.escalationFloor : shrink;
    lair.nextSpawnTick = w.tick + Math.round(def.spawnInterval * factor);
  }
}
