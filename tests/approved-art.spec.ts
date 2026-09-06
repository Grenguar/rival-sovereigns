import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { decodePng } from '../tools/png';

const RUNTIME_BUILDINGS = [
  'palace',
  'warriorsGuild',
  'roguesGuild',
  'rangersLodge',
  'marketplace',
  'blacksmith',
  'inn',
  'guardhouse',
] as const;

function opaquePixels(pixels: Uint8Array): number {
  let count = 0;
  for (let index = 3; index < pixels.length; index += 4) {
    if ((pixels[index] ?? 0) > 0) count++;
  }
  return count;
}

describe('approved generated art', () => {
  it('ships every runtime building as a grounded transparent frame', async () => {
    for (const kind of RUNTIME_BUILDINGS) {
      const png = decodePng(await readFile(`art/frames/${kind}_intact.png`));
      expect(png.width, kind).toBe(128);
      expect(png.height, kind).toBe(112);
      expect(opaquePixels(png.pixels), kind).toBeGreaterThan(500);
      expect(png.pixels[3], `${kind} top-left alpha`).toBe(0);
    }
  });

  it('packs complete terrain variants and representative landscape props', async () => {
    const atlas = JSON.parse(await readFile('public/atlas/game.json', 'utf8')) as {
      frames: Record<string, { frame: { w: number; h: number } }>;
    };
    for (const terrain of ['grass', 'forest', 'water', 'rock', 'road']) {
      for (const suffix of ['', '_1', '_2']) {
        expect(atlas.frames[`terrain_${terrain}${suffix}`]?.frame).toMatchObject({ w: 64, h: 32 });
      }
    }
    for (const prop of ['prop_aleppoPine', 'prop_oliveTree', 'prop_wheatField', 'prop_shorelineRocks']) {
      expect(atlas.frames[prop], prop).toBeDefined();
    }
  });
});
