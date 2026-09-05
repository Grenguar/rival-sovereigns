/**
 * C11 — Stage B art integration.
 *
 * Two things here can rot silently and both are visible to players: a terrain tile
 * that stops being a 64x32 diamond, and a shipped atlas that keeps claiming to be
 * self-made after third-party art is packed into it.
 */

import { describe, expect, test } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { decodePng } from '../tools/png';
import { STAGE_B_PROVENANCE, type StageBProvenance } from '../tools/provenance';

const ATLAS_JSON = 'public/atlas/game.json';
const RUNTIME_MANIFEST = 'public/assets.manifest.json';
const SOURCE_MANIFEST = 'assets.manifest.json';

const TERRAIN_FRAMES = [
  'terrain_grass',
  'terrain_forest',
  'terrain_water',
  'terrain_rock',
  'terrain_road',
];

interface AtlasFile {
  frames: Record<string, { frame: { x: number; y: number; w: number; h: number } }>;
}

const atlas = JSON.parse(readFileSync(ATLAS_JSON, 'utf8')) as AtlasFile;

describe('terrain frames', () => {
  test('all five terrain types are packed', () => {
    for (const name of TERRAIN_FRAMES) {
      expect(atlas.frames[name], `${name} missing from the atlas`).toBeDefined();
    }
  });

  test('every terrain tile is a 64x32 diamond — art bible §2', () => {
    // The whole projection depends on this. A tile that is not 2:1 makes every
    // building on it sit wrong, which is the defect §1 calls the most visible.
    for (const name of TERRAIN_FRAMES) {
      const f = atlas.frames[name];
      expect(f, name).toBeDefined();
      expect(f!.frame.w, `${name} width`).toBe(64);
      expect(f!.frame.h, `${name} height`).toBe(32);
    }
  });

  test('the packed terrain is not blank', () => {
    const png = decodePng(readFileSync('public/atlas/src/terrain_grass.png'));
    let opaque = 0;
    for (let i = 3; i < png.pixels.length; i += 4) {
      if ((png.pixels[i] as number) > 200) opaque++;
    }
    // A diamond covers about half its bounding box.
    expect(opaque).toBeGreaterThan(png.width * png.height * 0.3);
  });
});

describe('licensing stays honest', () => {
  const stageBRan = existsSync(STAGE_B_PROVENANCE);

  test('the runtime manifest attributes any third-party art it ships', () => {
    const runtime = JSON.parse(readFileSync(RUNTIME_MANIFEST, 'utf8')) as {
      name: string;
      license: string;
      author: string;
      sourcePage: string;
    }[];

    if (!stageBRan) {
      // Stage A only: everything in the atlas really is self-made.
      expect(runtime.every((e) => e.license === 'self-made')).toBe(true);
      return;
    }

    const thirdParty = runtime.filter((e) => e.license !== 'self-made');
    expect(thirdParty.length).toBeGreaterThan(0);
    for (const entry of thirdParty) {
      expect(entry.author, 'third-party art needs a named author').toBeTruthy();
      expect(entry.sourcePage).toMatch(/^https:\/\//);
      expect(entry.license).toMatch(/^(CC0|CC-BY)/);
    }
  });

  test('stage-b provenance names an asset that exists in the source manifest', () => {
    if (!stageBRan) return;
    const prov = JSON.parse(readFileSync(STAGE_B_PROVENANCE, 'utf8')) as StageBProvenance;
    const source = JSON.parse(readFileSync(SOURCE_MANIFEST, 'utf8')) as {
      assets: { id: string; licence: string }[];
    };
    const asset = source.assets.find((a) => a.id === prov.sourceAssetId);
    expect(asset, `${prov.sourceAssetId} is not in ${SOURCE_MANIFEST}`).toBeDefined();
    expect(asset!.licence).toMatch(/^(CC0|CC-BY|self-made)/);
    expect(prov.frames.length).toBeGreaterThan(0);
  });

  test('every frame stage-b claims is actually in the atlas', () => {
    if (!stageBRan) return;
    const prov = JSON.parse(readFileSync(STAGE_B_PROVENANCE, 'utf8')) as StageBProvenance;
    for (const frame of prov.frames) {
      expect(atlas.frames[frame], `${frame} claimed but not packed`).toBeDefined();
    }
  });
});
