/**
 * Promotes approved generated concepts into deterministic runtime frames.
 *
 * Image generation is deliberately kept outside the build. Checked-in source PNGs
 * are trimmed, background-cleaned, resized, and anchored here so every clone packs
 * byte-identical gameplay art without network access.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';

const OUT = 'art/frames';
const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 } as const;

interface IsolatedAsset {
  readonly source: string;
  readonly frame: string;
  readonly width: number;
  readonly height: number;
}

const BUILDINGS: readonly IsolatedAsset[] = [
  concept('palace-consell-catalan-concept-v1.png', 'palace_intact', 128, 112),
  concept('warriors-guild-catalan-concept-v1.png', 'warriorsGuild_intact', 128, 112),
  concept('rogues-guild-catalan-concept-v1.png', 'roguesGuild_intact', 128, 112),
  concept('rangers-lodge-catalan-concept-v1.png', 'rangersLodge_intact', 128, 112),
  concept('marketplace-catalan-concept-v1.png', 'marketplace_intact', 128, 112),
  concept('blacksmith-catalan-concept-v1.png', 'blacksmith_intact', 128, 112),
  concept('inn-hostal-catalan-concept-v1.png', 'inn_intact', 128, 112),
  concept('guardhouse-catalan-concept-v1.png', 'guardhouse_intact', 128, 112),
  // These are packed and ready for content work, but the human-owned BuildingKind
  // contract does not expose them yet.
  concept('library-estudi-catalan-concept-v1.png', 'library_intact', 128, 112),
  concept('trading-post-catalan-concept-v1.png', 'tradingPost_intact', 128, 112),
  concept('houses-catalan-concept-v1.png', 'houses_intact', 128, 112),
];

const PROPS: readonly IsolatedAsset[] = [
  prop('aleppo-pine-v1.png', 'prop_aleppoPine', 96, 112),
  prop('olive-tree-v1.png', 'prop_oliveTree', 96, 96),
  prop('orange-tree-v1.png', 'prop_orangeTree', 80, 88),
  prop('cypress-tree-v2.png', 'prop_cypressTree', 64, 112),
  prop('vineyard-row-v2.png', 'prop_vineyardRow', 128, 64),
  prop('wheat-field-v2.png', 'prop_wheatField', 96, 56),
  prop('mountain-crag-v2.png', 'prop_mountainCrag', 112, 88),
  prop('dry-stone-wall-v2.png', 'prop_dryStoneWall', 128, 48),
  prop('shoreline-rocks-v1.png', 'prop_shorelineRocks', 128, 80),
];

const TERRAIN = [
  ['grass', 'grass-dry-field-v1.png'],
  ['forest', 'forest-pine-olive-v1.png'],
  ['water', 'water-mediterranean-sea-v1.png'],
  ['rock', 'rock-prades-poblet-v1.png'],
  ['road', 'road-rural-stone-v1.png'],
] as const;

function concept(file: string, frame: string, width: number, height: number): IsolatedAsset {
  return { source: join('art/concepts', file), frame, width, height };
}

function prop(file: string, frame: string, width: number, height: number): IsolatedAsset {
  return { source: join('art/source/props', file), frame, width, height };
}

/**
 * Some generated PNGs contain a visually transparent checkerboard but no alpha.
 * Only neutral pixels connected to the canvas border are removed, so pale stone,
 * paper, surf, and internal negative spaces stay intact.
 */
export function clearConnectedBackdrop(
  pixels: Uint8Array,
  width: number,
  height: number,
): void {
  const visited = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  let head = 0;
  let tail = 0;

  const backdrop = (index: number): boolean => {
    const pixel = index * 4;
    const alpha = pixels[pixel + 3] as number;
    if (alpha < 16) return true;
    const red = pixels[pixel] as number;
    const green = pixels[pixel + 1] as number;
    const blue = pixels[pixel + 2] as number;
    const high = Math.max(red, green, blue);
    const low = Math.min(red, green, blue);
    return (low > 205 && high - low < 30) || (high < 52 && high - low < 28);
  };

  const enqueue = (index: number): void => {
    if (visited[index] !== 0 || !backdrop(index)) return;
    visited[index] = 1;
    queue[tail++] = index;
  };

  for (let x = 0; x < width; x++) {
    enqueue(x);
    enqueue((height - 1) * width + x);
  }
  for (let y = 1; y < height - 1; y++) {
    enqueue(y * width);
    enqueue(y * width + width - 1);
  }

  while (head < tail) {
    const index = queue[head++] as number;
    pixels[index * 4 + 3] = 0;
    const x = index % width;
    const y = Math.floor(index / width);
    if (x > 0) enqueue(index - 1);
    if (x + 1 < width) enqueue(index + 1);
    if (y > 0) enqueue(index - width);
    if (y + 1 < height) enqueue(index + width);
  }
}

async function cleanedSource(path: string): Promise<Buffer> {
  const decoded = await sharp(path).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const pixels = new Uint8Array(decoded.data);
  clearConnectedBackdrop(pixels, decoded.info.width, decoded.info.height);
  return sharp(Buffer.from(pixels), {
    raw: { width: decoded.info.width, height: decoded.info.height, channels: 4 },
  })
    .png()
    .toBuffer();
}

async function renderIsolated(asset: IsolatedAsset): Promise<void> {
  const cleaned = await cleanedSource(asset.source);
  const trimmed = await sharp(cleaned)
    .trim({ background: TRANSPARENT, threshold: 2 })
    .resize({
      width: asset.width - 4,
      height: asset.height - 4,
      fit: 'inside',
      kernel: sharp.kernel.lanczos3,
    })
    .png()
    .toBuffer({ resolveWithObject: true });
  const left = Math.floor((asset.width - trimmed.info.width) / 2);
  const top = asset.height - trimmed.info.height;
  await sharp({
    create: { width: asset.width, height: asset.height, channels: 4, background: TRANSPARENT },
  })
    .composite([{ input: trimmed.data, left, top }])
    .png({ compressionLevel: 9, adaptiveFiltering: false })
    .toFile(join(OUT, `${asset.frame}.png`));
}

const CROP_POINTS = [
  [0, 0],
  [1, 0],
  [0.5, 1],
] as const;

async function renderTerrain(kind: string, sourceFile: string): Promise<void> {
  const source = join('art/source/terrain', sourceFile);
  const metadata = await sharp(source).metadata();
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  const crop = Math.floor(Math.min(width, height) / 2);
  if (crop < 64) throw new Error(`${source} is too small to create terrain variants`);

  for (let variant = 0; variant < CROP_POINTS.length; variant++) {
    const point = CROP_POINTS[variant] as (typeof CROP_POINTS)[number];
    const left = Math.round((width - crop) * point[0]);
    const top = Math.round((height - crop) * point[1]);
    const decoded = await sharp(source)
      .extract({ left, top, width: crop, height: crop })
      .resize(64, 32, { fit: 'fill', kernel: sharp.kernel.lanczos3 })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const pixels = new Uint8Array(decoded.data);
    maskDiamond(pixels, 64, 32);
    const suffix = variant === 0 ? '' : `_${String(variant)}`;
    await sharp(Buffer.from(pixels), { raw: { width: 64, height: 32, channels: 4 } })
      .png({ compressionLevel: 9, adaptiveFiltering: false })
      .toFile(join(OUT, `terrain_${kind}${suffix}.png`));
  }
}

export function maskDiamond(pixels: Uint8Array, width: number, height: number): void {
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dx = Math.abs(x + 0.5 - width / 2) / (width / 2);
      const dy = Math.abs(y + 0.5 - height / 2) / (height / 2);
      if (dx + dy > 1) pixels[(y * width + x) * 4 + 3] = 0;
    }
  }
}

async function main(): Promise<void> {
  await mkdir(OUT, { recursive: true });
  for (const asset of [...BUILDINGS, ...PROPS]) await renderIsolated(asset);
  for (const [kind, source] of TERRAIN) await renderTerrain(kind, source);
  await writeFile(
    join(OUT, '.approved-art.json'),
    `${JSON.stringify(
      {
        generatedBy: 'tools/import-approved-art.ts',
        frames: [
          ...BUILDINGS.map((asset) => asset.frame),
          ...PROPS.map((asset) => asset.frame),
          ...TERRAIN.flatMap(([kind]) => [
            `terrain_${kind}`,
            `terrain_${kind}_1`,
            `terrain_${kind}_2`,
          ]),
        ].sort(),
      },
      null,
      2,
    )}\n`,
  );
  console.log(
    `import-approved-art: wrote ${String(BUILDINGS.length)} buildings, ` +
      `${String(PROPS.length)} props, and ${String(TERRAIN.length * 3)} terrain tiles`,
  );
}

if (process.argv[1]?.endsWith('import-approved-art.ts')) void main();
