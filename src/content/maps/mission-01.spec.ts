import { describe, expect, test } from 'vitest';
import { MissionMapSchema } from '../schema';
import { MISSION_01, MISSION_01_HEIGHT, MISSION_01_WIDTH, terrainAt } from './mission-01';

const landmark = (id: string) => MISSION_01.landmarks.find((candidate) => candidate.id === id)!;
const squaredDistance = (
  a: { tx: number; ty: number },
  b: { tx: number; ty: number },
): number => {
  const dx = a.tx - b.tx;
  const dy = a.ty - b.ty;
  return dx * dx + dy * dy;
};

describe('Mission 01', () => {
  test('is a schema-validated 96 by 96 hand-authored map', () => {
    expect(MissionMapSchema.parse(MISSION_01)).toEqual(MISSION_01);
    expect(MISSION_01.width).toBe(MISSION_01_WIDTH);
    expect(MISSION_01.height).toBe(MISSION_01_HEIGHT);
    expect(MISSION_01.terrain).toHaveLength(96 * 96);
  });

  test('has the palace and three lairs at the designed relative distances', () => {
    const palace = landmark('palace').tile;
    const warrenA = landmark('ratkin-warren-a').tile;
    const warrenB = landmark('ratkin-warren-b').tile;
    const camp = landmark('goblin-camp').tile;

    expect(palace.tx).toBeLessThan(48);
    expect(palace.ty).toBeGreaterThan(48);
    expect(squaredDistance(palace, warrenA)).toBe(512); // 22.6 tiles, rounded from "22" in the design.
    expect(warrenA.tx).toBeGreaterThan(palace.tx);
    expect(warrenA.ty).toBeLessThan(palace.ty);
    expect(squaredDistance(palace, warrenB)).toBe(882); // 29.7 tiles, rounded from "30" in the design.
    expect(warrenB.tx).toBeLessThan(palace.tx);
    expect(warrenB.ty).toBeGreaterThan(palace.ty);
    expect(squaredDistance(palace, camp)).toBe(46 * 46);
    expect(camp.tx).toBeGreaterThan(palace.tx);
  });

  test('puts Warren A behind light forest and the camp beyond the north-east river', () => {
    expect(terrainAt(MISSION_01, 54, 42)).toBe('forest');
    expect(terrainAt(MISSION_01, 69, 40)).toBe('water');
    expect(terrainAt(MISSION_01, 69, 54)).toBe('road');
    expect(terrainAt(MISSION_01, 86, 54)).toBe('grass');
  });

  test('rejects malformed terrain and landmarks outside the map', () => {
    expect(() => MissionMapSchema.parse({ ...MISSION_01, terrain: [] })).toThrow(
      /width \* height/,
    );
    expect(() =>
      MissionMapSchema.parse({
        ...MISSION_01,
        landmarks: [{ id: 'outside', kind: 'palace', tile: { tx: 96, ty: 0 } }],
      }),
    ).toThrow(/inside map bounds/);
  });
});
