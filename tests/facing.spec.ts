import { describe, expect, it } from 'vitest';
import { DIR8, worldToScreen } from '../src/core/spatial/iso';
import { FRAMES } from '../src/render/frames.gen';
import { MIRRORED_FACINGS, facingForTest } from '../src/render/frame-for';

/** Screen-space unit vector a DIR8 index points along, under the iso projection. */
function screenDirection(index: number): { sx: number; sy: number } {
  const dir = DIR8[index] as { dx: number; dy: number };
  const { sx, sy } = worldToScreen(dir.dx, dir.dy);
  const length = Math.hypot(sx, sy);
  return { sx: sx / length, sy: sy / length };
}

/** The screen direction each atlas silhouette depicts, mirrored on the x axis when asked. */
const ART: Record<string, { sx: number; sy: number }> = {
  ne: screenDirection(0),
  e: screenDirection(1),
  se: screenDirection(2),
  s: screenDirection(3),
};

describe('unit facing', () => {
  it('picks the best silhouette the atlas can offer for every direction', () => {
    for (let facing = 0; facing < 8; facing++) {
      const want = screenDirection(facing);
      const align = (name: string, mirror: number): number => {
        const art = ART[name] as { sx: number; sy: number };
        return art.sx * mirror * want.sx + art.sy * want.sy;
      };
      const best = Math.max(
        ...Object.keys(ART).flatMap((name) => [align(name, 1), align(name, -1)]),
      );
      const chosen = align(facingForTest(facing), MIRRORED_FACINGS.has(facing) ? -1 : 1);

      // Four silhouettes cannot span the compass evenly under a 2:1 iso projection,
      // so the bar is that nothing else in the atlas fits better, not a fixed angle.
      expect(chosen, `facing ${String(facing)}`).toBeCloseTo(best, 9);
    }
  });

  it('only mirrors directions that actually point west on screen', () => {
    for (let facing = 0; facing < 8; facing++)
      expect(MIRRORED_FACINGS.has(facing), `facing ${String(facing)}`).toBe(
        screenDirection(facing).sx < -1e-9,
      );
  });

  it('every facing it can select exists in the packed atlas', () => {
    for (let facing = 0; facing < 8; facing++)
      for (const kind of ['guard', 'goblin'])
        expect(FRAMES).toHaveProperty(`${kind}_idle_${facingForTest(facing)}_00`);
  });
});
