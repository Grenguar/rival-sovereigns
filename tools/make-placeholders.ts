import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { encodePng } from './png';

const OUT = 'public/atlas/src';
const colors = {
  grass: [90, 139, 74],
  forest: [67, 107, 57],
  water: [58, 107, 145],
  rock: [142, 142, 150],
  road: [138, 111, 74],
  warrior: [196, 69, 58],
  ranger: [63, 158, 92],
  rogue: [139, 95, 191],
  ratkin: [122, 106, 74],
  goblin: [104, 129, 56],
  goblinRaider: [78, 104, 40],
  peasant: [176, 156, 122],
  taxCollector: [198, 170, 78],
  guard: [92, 108, 158],
  gold: [232, 185, 60],
} as const;
const frames = [
  'terrain_grass',
  'terrain_forest',
  'terrain_water',
  'terrain_rock',
  'terrain_road',
  'flag_attack',
  'flag_explore',
  'fx_dust',
  'fx_decal',
];
const subjects = [
  'warrior',
  'ranger',
  'rogue',
  'ratkin',
  'goblin',
  'goblinRaider',
  'peasant',
  'taxCollector',
  'guard',
];
const buildings = [
  'palace',
  'warriorsGuild',
  'roguesGuild',
  'rangersLodge',
  'marketplace',
  'blacksmith',
  'inn',
  'guardhouse',
];
const lairs = ['ratkinWarren', 'goblinCamp'];

async function write(
  name: string,
  width: number,
  height: number,
  paint: (p: Uint8Array) => void,
): Promise<void> {
  const p = new Uint8Array(width * height * 4);
  paint(p);
  await writeFile(join(OUT, `${name}.png`), encodePng({ width, height, pixels: p }));
}
function pixel(
  p: Uint8Array,
  w: number,
  x: number,
  y: number,
  c: readonly [number, number, number],
  a = 255,
): void {
  if (x < 0 || y < 0 || x >= w || y >= p.length / w / 4) return;
  const i = (y * w + x) * 4;
  p[i] = c[0];
  p[i + 1] = c[1];
  p[i + 2] = c[2];
  p[i + 3] = a;
}
function diamond(
  p: Uint8Array,
  w: number,
  h: number,
  c: readonly [number, number, number],
): void {
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (Math.abs(x - w / 2) / (w / 2) + Math.abs(y - h / 2) / (h / 2) <= 1)
        pixel(
          p,
          w,
          x,
          y,
          [c[0] - (y > h / 2 ? 18 : 0), c[1] - (x < w / 2 ? 12 : 0), c[2]],
          255,
        );
}
function rect(
  p: Uint8Array,
  w: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  c: readonly [number, number, number],
): void {
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) pixel(p, w, x, y, c);
}
function gable(
  p: Uint8Array,
  cx: number,
  top: number,
  width: number,
  height: number,
  c: readonly [number, number, number],
): void {
  for (let y = 0; y < height; y++) {
    const half = Math.max(1, Math.floor((width * (y + 1)) / height / 2));
    rect(p, 128, cx - half, top + y, cx + half + 1, top + y + 1, c);
  }
}
function buildingSprite(p: Uint8Array, building: string, state: string): void {
  const base = state === 'rubble' ? colors.rock : colors.road;
  diamond(p, 128, 64, base);
  const roof = building.includes('rogue')
    ? colors.rogue
    : building.includes('ranger')
      ? colors.ranger
      : building === 'marketplace'
        ? colors.gold
        : building === 'blacksmith'
          ? colors.rock
          : building === 'inn'
            ? ([174, 96, 66] as const)
            : building === 'guardhouse'
              ? colors.guard
              : colors.warrior;
  const height =
    state === 'rubble'
      ? 12
      : state === 'construction'
        ? 30
        : building === 'palace'
          ? 56
          : building === 'guardhouse'
            ? 42
            : 54;
  const left = building === 'guardhouse' ? 48 : building === 'palace' ? 24 : 34;
  const right = 128 - left;
  rect(p, 128, left, 62 - height, right, 62, roof);
  // A different roofline makes recognition possible at game speed, before colour.
  if (state !== 'rubble') {
    if (building === 'palace') {
      rect(p, 128, 30, 22, 48, 62, roof);
      rect(p, 128, 80, 22, 98, 62, roof);
      rect(p, 128, 50, 12, 78, 62, roof);
      gable(p, 39, 8, 26, 16, colors.gold);
      gable(p, 89, 8, 26, 16, colors.gold);
      gable(p, 64, 0, 32, 20, colors.gold);
    }
    if (building.includes('Guild')) {
      rect(p, 128, 28, 62 - height - 10, 100, 62 - height + 4, roof);
      rect(
        p,
        128,
        building.includes('warrior') ? 35 : 82,
        62 - height - 28,
        building.includes('warrior') ? 42 : 89,
        62 - height,
        colors.gold,
      );
    }
    if (building === 'marketplace') {
      for (let x = 34; x < 94; x += 12)
        rect(
          p,
          128,
          x,
          62 - height - 10,
          x + 7,
          62 - height + 8,
          x % 24 === 0 ? colors.warrior : colors.gold,
        );
    }
    if (building === 'blacksmith') {
      rect(p, 128, 77, 62 - height - 20, 88, 62 - height + 5, colors.rock);
      rect(p, 128, 52, 46, 76, 51, [55, 55, 62]);
    }
    if (building === 'inn') {
      rect(p, 128, 51, 34, 77, 40, colors.gold);
      rect(p, 128, 61, 38, 67, 62, [74, 47, 36]);
    }
    if (building === 'guardhouse') {
      rect(p, 128, 56, 62 - height - 22, 72, 62 - height + 2, colors.guard);
      rect(p, 128, 64, 62 - height - 34, 67, 62 - height - 18, colors.gold);
    }
  }
  if (state === 'damaged')
    for (let y = 20; y < 62; y += 11) rect(p, 128, 53, y, 57, y + 8, colors.rock);
}
function unitSprite(p: Uint8Array, subject: string, frame: number): void {
  const c = colors[subject as keyof typeof colors] ?? colors.goblin;
  // Head, cloak/body and a readable held item — an intentional silhouette, not a capsule.
  for (let y = 9; y < 20; y++)
    for (let x = 11; x < 22; x++)
      if ((x - 16) * (x - 16) + (y - 14) * (y - 14) < 30) pixel(p, 32, x, y, [238, 203, 164]);
  for (let y = 19; y < 42; y++)
    for (let x = 7; x < 25; x++) if (Math.abs(x - 16) < 3 + (y - 19) / 2) pixel(p, 32, x, y, c);
  const weapon =
    subject === 'ranger'
      ? colors.gold
      : subject === 'rogue'
        ? colors.rogue
        : subject.includes('goblin') || subject === 'ratkin'
          ? colors.rock
          : ([228, 228, 218] as const);
  rect(
    p,
    32,
    subject === 'ranger' ? 23 : 24,
    19 + (frame % 3),
    subject === 'ranger' ? 25 : 27,
    39,
    weapon,
  );
  if (subject === 'ranger') rect(p, 32, 20, 21, 27, 23, weapon);
  if (subject === 'rogue') rect(p, 32, 5, 24, 9, 35, weapon);
}
async function main(): Promise<void> {
  await mkdir(OUT, { recursive: true });
  for (const name of frames)
    await write(name, 64, 40, (p) => {
      if (name.startsWith('terrain'))
        diamond(p, 64, 32, colors[name.slice(8) as keyof typeof colors] ?? colors.grass);
      else if (name.startsWith('flag')) {
        diamond(p, 64, 32, colors.grass);
        for (let y = 0; y < 32; y++) pixel(p, 64, 31, y, colors.gold);
        for (let y = 4; y < 15; y++)
          for (let x = 32; x < 48; x++)
            pixel(p, 64, x, y, name.endsWith('attack') ? colors.warrior : colors.ranger);
      } else {
        for (let y = 12; y < 28; y++)
          for (let x = 20; x < 44; x++)
            pixel(p, 64, x, y, name === 'fx_decal' ? [122, 83, 52] : colors.gold, 170);
      }
    });
  for (const subject of subjects)
    for (const action of ['idle', 'walk', 'attack'])
      for (
        let frame = 0;
        frame < (action === 'walk' ? 4 : action === 'attack' ? 2 : 1);
        frame++
      )
        await write(`${subject}_${action}_s_${String(frame).padStart(2, '0')}`, 32, 48, (p) =>
          unitSprite(p, subject, frame),
        );
  for (const building of buildings)
    for (const state of ['intact', 'construction', 'damaged', 'rubble'])
      await write(`${building}_${state}`, 128, 112, (p) => buildingSprite(p, building, state));
  for (const lair of lairs)
    for (const state of ['intact', 'damaged', 'rubble'])
      await write(`${lair}_${state}`, 128, 112, (p) => {
        diamond(p, 128, 64, colors.rock);
        const c = lair === 'goblinCamp' ? colors.goblin : colors.ratkin;
        const height = state === 'rubble' ? 10 : state === 'damaged' ? 30 : 46;
        for (let y = 56 - height; y < 56; y++)
          for (let x = 40; x < 88; x++)
            if (Math.abs(x - 64) < (56 - y) * 0.9)
              pixel(p, 128, x, y, state === 'damaged' && y % 6 < 2 ? colors.rock : c);
      });
  console.log(`make-placeholders: wrote Stage A sprites to ${OUT}`);
}
void main();
