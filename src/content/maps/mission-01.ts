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

  // A light, permeable forest between the palace and Warren A. It leaves a few
  // grass lanes, so it reads as a scouting obstacle rather than an impassable wall.
  rectangle(48, 37, 12, 10, 'forest');
  rectangle(52, 34, 8, 5, 'forest');
  for (const [tx, ty] of [
    [50, 40],
    [53, 42],
    [56, 40],
    [58, 44],
  ] as const)
    paint(tx, ty, 'grass');

  // A north-east river. The road ford is the sole safe route to the eastern camp.
  for (let ty = 0; ty < 70; ty++) {
    const riverX = 66 + Math.floor(ty / 14);
    for (let tx = riverX; tx < riverX + 3; tx++) paint(tx, ty, 'water');
  }
  rectangle(68, 53, 3, 2, 'road');

  // Opening roads are visual guidance only; gameplay walkability is owned by the
  // spatial layer when maps are wired into world creation.
  rectangle(35, 54, 31, 1, 'road');
  rectangle(40, 54, 1, 6, 'road');
  rectangle(20, 75, 21, 1, 'road');
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
