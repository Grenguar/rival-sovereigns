/**
 * C8 — Mission 01's fixed, hand-authored opening map.
 *
 * The layout comes from docs/01-game-design.md §10. It is intentionally built
 * from explicit, deterministic paint operations rather than a seeded generator:
 * balance runs must always begin with exactly this terrain.
 */

import { MissionMapSchema, type MissionMap } from '../schema';

export const MISSION_01_WIDTH = 96;
export const MISSION_01_HEIGHT = 96;

type Terrain = MissionMap['terrain'][number];

const tileIndex = (tx: number, ty: number): number => ty * MISSION_01_WIDTH + tx;

/**
 * Deterministic value noise.
 *
 * The map must be byte-identical on every run and every engine, so this is integer
 * hashing plus linear interpolation — no Math.random, and nothing from the banned
 * list in docs/03-determinism.md §3. Content is under the same ESLint gate as core.
 */
function hash2(x: number, y: number): number {
  let h = Math.imul(x, 0x27d4eb2d) ^ Math.imul(y, 0x165667b1);
  h = Math.imul(h ^ (h >>> 15), 0x2545f491);
  return ((h ^ (h >>> 13)) >>> 0) / 4294967296;
}

/** Smooth 0..1 noise over cells of `scale` tiles, so patches read as woodland. */
function noise(tx: number, ty: number, scale: number, salt: number): number {
  const gx = tx / scale;
  const gy = ty / scale;
  const x0 = Math.floor(gx);
  const y0 = Math.floor(gy);
  const fx = gx - x0;
  const fy = gy - y0;
  // Smoothstep the interpolant so patch edges are soft rather than diamond-shaped.
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);

  const n00 = hash2(x0 + salt, y0);
  const n10 = hash2(x0 + 1 + salt, y0);
  const n01 = hash2(x0 + salt, y0 + 1);
  const n11 = hash2(x0 + 1 + salt, y0 + 1);

  const top = n00 + (n10 - n00) * sx;
  const bottom = n01 + (n11 - n01) * sx;
  return top + (bottom - top) * sy;
}

const PALACE_TILE = { tx: 40, ty: 54 } as const;
const LAIR_TILES = [
  { tx: 56, ty: 38 },
  { tx: 19, ty: 75 },
  { tx: 86, ty: 54 },
] as const;

const distanceTo = (tx: number, ty: number, to: { tx: number; ty: number }): number => {
  const dx = tx - to.tx;
  const dy = ty - to.ty;
  return Math.sqrt(dx * dx + dy * dy);
};

function createTerrain(): Terrain[] {
  const terrain: Terrain[] = Array.from(
    { length: MISSION_01_WIDTH * MISSION_01_HEIGHT },
    () => 'grass',
  );
  const paint = (tx: number, ty: number, value: Terrain): void => {
    if (tx >= 0 && tx < MISSION_01_WIDTH && ty >= 0 && ty < MISSION_01_HEIGHT) {
      terrain[tileIndex(tx, ty)] = value;
    }
  };
  const rectangle = (
    x: number,
    y: number,
    width: number,
    height: number,
    value: Terrain,
  ): void => {
    for (let ty = y; ty < y + height; ty++)
      for (let tx = x; tx < x + width; tx++) paint(tx, ty, value);
  };

  // ── Woodland and outcrops ────────────────────────────────────────────────
  // The map was 95.6% grass — one tile repeated 8,807 times, which reads as
  // wallpaper rather than terrain. Two noise fields at different scales give
  // woodland to scout around and rock to break up the open ground.
  for (let ty = 0; ty < MISSION_01_HEIGHT; ty++) {
    for (let tx = 0; tx < MISSION_01_WIDTH; tx++) {
      const wood = noise(tx, ty, 11, 0);
      const stone = noise(tx, ty, 7, 977);

      if (stone > 0.78) {
        paint(tx, ty, 'rock');
      } else if (wood > 0.56) {
        paint(tx, ty, 'forest');
      }
    }
  }

  // Denser belt between the palace and Warren A, so the tutorial threat sits
  // behind cover exactly as docs/01-game-design.md §10 describes.
  for (let ty = 34; ty < 47; ty++) {
    for (let tx = 48; tx < 60; tx++) {
      if (noise(tx, ty, 6, 41) > 0.34) paint(tx, ty, 'forest');
    }
  }

  // ── The north-east river ─────────────────────────────────────────────────
  // The eastern camp is meant to be a commitment, so the river is the barrier and
  // the ford is the decision.
  for (let ty = 0; ty < 72; ty++) {
    const riverX = 66 + Math.floor(ty / 14) + Math.floor(noise(0, ty, 9, 7) * 3);
    for (let tx = riverX; tx < riverX + 4; tx++) paint(tx, ty, 'water');
  }

  // ── Roads ────────────────────────────────────────────────────────────────
  rectangle(35, 54, 31, 1, 'road');
  rectangle(40, 48, 1, 12, 'road');
  rectangle(20, 75, 21, 1, 'road');
  rectangle(40, 60, 1, 16, 'road');
  // The ford: the sole dry crossing to the goblin camp.
  rectangle(66, 54, 8, 2, 'road');
  rectangle(74, 54, 12, 1, 'road');

  // ── Clearings ────────────────────────────────────────────────────────────
  // Nothing may grow over the build radius or the approach to a lair; a warren
  // hidden inside a forest cannot be seen, approached or fought.
  for (let ty = 0; ty < MISSION_01_HEIGHT; ty++) {
    for (let tx = 0; tx < MISSION_01_WIDTH; tx++) {
      const onRoad = terrain[tileIndex(tx, ty)] === 'road';
      const onWater = terrain[tileIndex(tx, ty)] === 'water';
      if (onRoad || onWater) continue;

      if (distanceTo(tx, ty, PALACE_TILE) <= 11) {
        paint(tx, ty, 'grass');
        continue;
      }
      // Just enough room to see and approach a lair. Wider than this and Warren A
      // stops sitting "behind light forest" the way §10 describes it.
      for (const lair of LAIR_TILES) {
        if (distanceTo(tx, ty, lair) <= 3) paint(tx, ty, 'grass');
      }
    }
  }

  return terrain;
}

const rawMission01 = {
  id: 'mission-01',
  width: MISSION_01_WIDTH,
  height: MISSION_01_HEIGHT,
  terrain: createTerrain(),
  clearBuildRadius: 9,
  landmarks: [
    { id: 'palace', kind: 'palace', tile: { tx: 40, ty: 54 } },
    { id: 'ratkin-warren-a', kind: 'ratkinWarren', tile: { tx: 56, ty: 38 } },
    { id: 'ratkin-warren-b', kind: 'ratkinWarren', tile: { tx: 19, ty: 75 } },
    { id: 'goblin-camp', kind: 'goblinCamp', tile: { tx: 86, ty: 54 } },
  ],
} as const;

export const MISSION_01: MissionMap = MissionMapSchema.parse(rawMission01);

export function terrainAt(map: MissionMap, tx: number, ty: number): Terrain | null {
  if (tx < 0 || ty < 0 || tx >= map.width || ty >= map.height) return null;
  return map.terrain[ty * map.width + tx] ?? null;
}
