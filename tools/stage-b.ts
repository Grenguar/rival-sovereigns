/**
 * C11 — Stage B art integration.
 *
 * Replaces the procedural Stage A terrain with real CC0 art from the verified
 * archives in assets.manifest.json, and does it deterministically: same archives in,
 * byte-identical PNGs out.
 *
 * Two rules from docs/05-art-bible.md drive every decision here:
 *
 *   §1 "Inconsistent camera angles are the single most visible defect in isometric
 *      games — far more noticeable than mediocre sprite quality." So Stage B replaces
 *      whole *categories* at a time, from a single source pack, rather than
 *      scattering new art among the placeholders.
 *
 *   §2 "Anchors matter more than sizes." A terrain tile is a 64x32 diamond with no
 *      overhang, so the block's top face is cropped out rather than the whole block
 *      squashed — squashing a 111x128 block into 64x32 deforms the very angle §1
 *      says must never vary.
 *
 * Runs offline-safe: if the archives are absent the Stage A art stays and the build
 * still succeeds, because `pnpm pregen` must work on a fresh clone with no network.
 */

import { execFileSync } from 'node:child_process';
import { STAGE_B_PROVENANCE } from './provenance';
import { existsSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { decodePng, encodePng, type Png } from './png';

const OUT = 'public/atlas/src';

const BLOCKS = 'assets/vendor/kenney_isometric-blocks.zip';

/** Art bible §2: terrain tile is a 64x32 diamond. */
const TILE_W = 64;
const TILE_H = 32;

/**
 * Which source tile becomes which terrain frame.
 *
 * Kenney's voxel tiles are numbered, not named, so choosing by filename would be
 * guesswork that silently rots if the pack is ever re-released. Instead each frame
 * declares the colour it should read as, and the tile whose top face is closest wins.
 * That is deterministic, and it is checkable by eye against the logged match.
 */
const TERRAIN: { frame: string; rgb: [number, number, number] }[] = [
  { frame: 'terrain_grass', rgb: [126, 189, 79] },
  { frame: 'terrain_forest', rgb: [58, 110, 58] },
  { frame: 'terrain_water', rgb: [78, 148, 206] },
  { frame: 'terrain_rock', rgb: [140, 140, 145] },
  { frame: 'terrain_road', rgb: [176, 148, 106] },
];

function listEntries(archive: string, pattern: RegExp): string[] {
  const out = execFileSync('unzip', ['-Z1', archive], { encoding: 'utf8', maxBuffer: 1 << 26 });
  return out
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => pattern.test(l))
    .sort(); // stable order in, stable choice out
}

function readEntry(archive: string, entry: string): Png {
  const buf = execFileSync('unzip', ['-p', archive, entry], { maxBuffer: 1 << 28 });
  return decodePng(new Uint8Array(buf));
}

/** Crops a rectangle out of a decoded PNG. */
function crop(src: Png, x0: number, y0: number, w: number, h: number): Png {
  const pixels = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    const sy = y0 + y;
    if (sy < 0 || sy >= src.height) continue;
    for (let x = 0; x < w; x++) {
      const sx = x0 + x;
      if (sx < 0 || sx >= src.width) continue;
      const s = (sy * src.width + sx) * 4;
      const d = (y * w + x) * 4;
      pixels[d] = src.pixels[s] as number;
      pixels[d + 1] = src.pixels[s + 1] as number;
      pixels[d + 2] = src.pixels[s + 2] as number;
      pixels[d + 3] = src.pixels[s + 3] as number;
    }
  }
  return { width: w, height: h, pixels };
}

/**
 * Box-filter downscale, alpha-weighted.
 *
 * Weighting by alpha matters: averaging RGB across transparent pixels drags the
 * colour toward whatever happens to sit in the unused channels and leaves a dark
 * fringe around the diamond edge.
 */
function resize(src: Png, w: number, h: number): Png {
  const pixels = new Uint8Array(w * h * 4);
  const xRatio = src.width / w;
  const yRatio = src.height / h;

  for (let y = 0; y < h; y++) {
    const sy0 = Math.floor(y * yRatio);
    const sy1 = Math.max(sy0 + 1, Math.floor((y + 1) * yRatio));
    for (let x = 0; x < w; x++) {
      const sx0 = Math.floor(x * xRatio);
      const sx1 = Math.max(sx0 + 1, Math.floor((x + 1) * xRatio));

      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let weight = 0;
      let count = 0;

      for (let sy = sy0; sy < sy1 && sy < src.height; sy++) {
        for (let sx = sx0; sx < sx1 && sx < src.width; sx++) {
          const s = (sy * src.width + sx) * 4;
          const alpha = src.pixels[s + 3] as number;
          r += (src.pixels[s] as number) * alpha;
          g += (src.pixels[s + 1] as number) * alpha;
          b += (src.pixels[s + 2] as number) * alpha;
          a += alpha;
          weight += alpha;
          count++;
        }
      }

      const d = (y * w + x) * 4;
      if (weight === 0 || count === 0) continue; // fully transparent, leave zeroed
      pixels[d] = Math.round(r / weight);
      pixels[d + 1] = Math.round(g / weight);
      pixels[d + 2] = Math.round(b / weight);
      pixels[d + 3] = Math.round(a / count);
    }
  }
  return { width: w, height: h, pixels };
}

/** Mean opaque colour, used to match a tile against its intended terrain. */
function meanColour(png: Png): [number, number, number] {
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  for (let i = 0; i < png.pixels.length; i += 4) {
    if ((png.pixels[i + 3] as number) < 200) continue;
    r += png.pixels[i] as number;
    g += png.pixels[i + 1] as number;
    b += png.pixels[i + 2] as number;
    n++;
  }
  return n === 0 ? [0, 0, 0] : [Math.round(r / n), Math.round(g / n), Math.round(b / n)];
}

const distance = (a: [number, number, number], b: [number, number, number]): number => {
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  return dr * dr + dg * dg + db * db;
};

async function main(): Promise<void> {
  if (!existsSync(BLOCKS)) {
    console.log('stage-b: archives absent, keeping Stage A art (run `pnpm assets:fetch` first)');
    return;
  }

  const entries = listEntries(BLOCKS, /PNG\/Voxel tiles\/voxelTile_\d+\.png$/);
  if (entries.length === 0) throw new Error('stage-b: no voxel tiles found in the blocks archive');

  // Decode every candidate once, cropping to the top face.
  const candidates = entries.map((entry) => {
    const png = readEntry(BLOCKS, entry);
    // A 2:1 isometric block of width W has a top face W/2 tall, flush to the top.
    const face = crop(png, 0, 0, png.width, Math.round(png.width / 2));
    return { entry, face, colour: meanColour(face) };
  });

  const used = new Set<string>();
  for (const want of TERRAIN) {
    let best: (typeof candidates)[number] | null = null;
    let bestD = Number.POSITIVE_INFINITY;
    for (const c of candidates) {
      if (used.has(c.entry)) continue; // one source tile per terrain type
      const d = distance(c.colour, want.rgb);
      // Ties break on entry name so the choice never depends on readdir order.
      if (d < bestD || (d === bestD && best !== null && c.entry < best.entry)) {
        best = c;
        bestD = d;
      }
    }
    if (best === null) throw new Error(`stage-b: no candidate left for ${want.frame}`);
    used.add(best.entry);

    const tile = resize(best.face, TILE_W, TILE_H);
    await writeFile(join(OUT, `${want.frame}.png`), encodePng(tile));
    console.log(
      `stage-b: ${want.frame} <- ${best.entry.split('/').pop()} rgb(${best.colour.join(',')})`,
    );
  }

  // Record where each frame came from. build-atlas.ts turns this into the runtime
  // manifest, so the shipped atlas cannot claim to be self-made once it contains
  // third-party art — licensing is a hard gate, not a note in a README.
  await writeFile(
    STAGE_B_PROVENANCE,
    `${JSON.stringify(
      {
        sourceAssetId: 'kenney-isometric-blocks',
        frames: TERRAIN.map((t) => t.frame).sort(),
      },
      null,
      2,
    )}\n`,
  );

  console.log(`stage-b: replaced ${TERRAIN.length} terrain frames at ${TILE_W}x${TILE_H}`);
}

void main();
