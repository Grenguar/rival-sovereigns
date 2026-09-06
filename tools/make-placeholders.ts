import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { encodePng } from './png';

const OUT = 'art/frames';
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
/** A footprint placed inside a taller transparent building frame. */
function diamondAt(
  p: Uint8Array,
  w: number,
  cx: number,
  cy: number,
  halfW: number,
  halfH: number,
  c: readonly [number, number, number],
): void {
  for (let y = cy - halfH; y <= cy + halfH; y++) {
    const ratio = 1 - Math.abs(y - cy) / halfH;
    const span = Math.floor(halfW * ratio);
    for (let x = cx - span; x <= cx + span; x++) {
      const shade = y > cy ? 18 : x < cx ? 10 : 0;
      pixel(p, w, x, y, [c[0] - shade, c[1] - shade, c[2]], 255);
    }
  }
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
function roofPlane(
  p: Uint8Array,
  cx: number,
  top: number,
  halfW: number,
  halfH: number,
  c: readonly [number, number, number],
): void {
  diamondAt(p, 128, cx, top + halfH, halfW, halfH, c);
}
function window(
  p: Uint8Array,
  x: number,
  y: number,
  warm = false,
): void {
  rect(p, 128, x, y, x + 5, y + 7, warm ? colors.gold : ([61, 78, 93] as const));
}
function beam(p: Uint8Array, x: number, y: number, length: number): void {
  for (let offset = 0; offset < length; offset++) pixel(p, 128, x + offset, y + offset, [78, 52, 38]);
}
function buildingSprite(p: Uint8Array, building: string, state: string): void {
  const baseline = 88;
  const wallLight = [193, 159, 108] as const;
  const wallShade = [141, 105, 70] as const;
  const timber = [78, 52, 38] as const;
  const roof =
    building === 'roguesGuild'
      ? colors.rogue
      : building === 'rangersLodge'
        ? colors.ranger
        : building === 'marketplace'
          ? colors.gold
          : building === 'blacksmith'
            ? colors.rock
            : building === 'inn'
              ? ([164, 83, 58] as const)
              : building === 'guardhouse'
                ? colors.guard
                : colors.warrior;
  diamondAt(p, 128, 64, baseline, 56, 28, state === 'rubble' ? colors.rock : colors.road);

  if (state === 'rubble') {
    // Rubble keeps its footprint but removes the misleading intact roof silhouette.
    for (let x = 30; x < 100; x += 11) {
      const pile = 5 + ((x * 7) % 12);
      gable(p, x, baseline - pile, 12, pile, x % 2 ? wallShade : colors.rock);
    }
    rect(p, 128, 58, baseline - 7, 70, baseline, timber);
    return;
  }

  if (state === 'construction') {
    // A shared but unmistakable work-in-progress: open timber framing and a raised roof beam.
    rect(p, 128, 37, 58, 91, 62, wallLight);
    rect(p, 128, 37, 62, 91, baseline, wallShade);
    for (let x = 39; x <= 86; x += 12) {
      rect(p, 128, x, 38, x + 3, baseline, timber);
      beam(p, x, 44, 30);
    }
    roofPlane(p, 64, 34, 34, 10, roof);
    rect(p, 128, 32, baseline - 5, 49, baseline - 2, colors.gold);
    return;
  }

  const wall = (left: number, top: number, right: number): void => {
    for (let y = top; y < baseline; y++) {
      const inset = Math.floor((baseline - y) / 8);
      rect(p, 128, left + inset, y, 64, y + 1, wallLight);
      rect(p, 128, 64, y, right - inset, y + 1, wallShade);
    }
  };
  if (building === 'palace') {
    wall(21, 46, 107);
    roofPlane(p, 64, 29, 43, 17, colors.warrior);
    // Three stepped towers, gold crests and window rows read as a royal compound.
    for (const [x, top] of [[34, 25], [64, 12], [94, 25]] as const) {
      rect(p, 128, x - 8, top + 14, x + 8, 58, wallLight);
      roofPlane(p, x, top, 12, 14, colors.warrior);
      gable(p, x, top - 8, 10, 9, colors.gold);
      window(p, x - 3, top + 24, true);
    }
    rect(p, 128, 61, 57, 68, baseline, timber);
  } else if (building === 'warriorsGuild') {
    wall(27, 48, 101);
    roofPlane(p, 62, 26, 39, 22, roof);
    gable(p, 62, 17, 40, 18, roof);
    // Crossed steel blades over the great-hall door make the guild readable at zoom.
    beam(p, 51, 51, 15);
    for (let offset = 0; offset < 15; offset++) pixel(p, 128, 73 - offset, 51 + offset, [226, 228, 218]);
    rect(p, 128, 58, 67, 68, baseline, timber);
  } else if (building === 'roguesGuild') {
    wall(35, 54, 93);
    roofPlane(p, 60, 37, 33, 17, roof);
    // A crooked side tower, hooded awning and dagger-shaped sign keep this low and secretive.
    rect(p, 128, 79, 31, 91, 70, wallShade);
    roofPlane(p, 85, 21, 12, 12, roof);
    gable(p, 52, 45, 25, 11, [67, 43, 88]);
    rect(p, 128, 50, 66, 63, baseline, timber);
    rect(p, 128, 32, 45, 35, 64, colors.gold);
    pixel(p, 128, 34, 43, [226, 228, 218]);
  } else if (building === 'rangersLodge') {
    wall(29, 52, 99);
    roofPlane(p, 63, 29, 40, 23, roof);
    gable(p, 63, 19, 42, 20, roof);
    // Lodge is framed by two pines and carries a curved bow sign.
    for (const x of [27, 101]) {
      rect(p, 128, x - 2, 42, x + 3, baseline, timber);
      for (let tier = 0; tier < 3; tier++)
        gable(p, x, 28 + tier * 9, 20 - tier * 3, 15, colors.forest);
    }
    for (let y = 49; y < 65; y++) pixel(p, 128, 43 + Math.floor((y - 49) / 3), y, colors.gold);
    rect(p, 128, 59, 69, 69, baseline, timber);
  } else if (building === 'marketplace') {
    // Open, low stalls leave a deliberately busy, potion-selling silhouette.
    rect(p, 128, 29, 66, 99, baseline, wallShade);
    for (const [x, c] of [[34, colors.warrior], [55, colors.gold], [76, colors.ranger]] as const) {
      rect(p, 128, x, 48, x + 17, 70, wallLight);
      roofPlane(p, x + 8, 39, 12, 10, c);
      rect(p, 128, x + 2, 69, x + 15, 73, timber);
      // Three bright bottles: health, mana and antidote rather than generic market clutter.
      for (const [offset, bottle] of [[3, colors.warrior], [7, colors.rogue], [11, colors.ranger]] as const) {
        rect(p, 128, x + offset, 60, x + offset + 3, 67, bottle);
        pixel(p, 128, x + offset + 1, 58, colors.gold);
      }
    }
    rect(p, 128, 58, 73, 70, baseline, timber);
  } else if (building === 'blacksmith') {
    wall(30, 53, 99);
    roofPlane(p, 59, 35, 37, 18, roof);
    gable(p, 59, 26, 37, 15, roof);
    // Forge chimney, orange furnace mouth and anvil form the signature industrial cluster.
    rect(p, 128, 78, 20, 90, 61, [70, 70, 75]);
    rect(p, 128, 80, 15, 88, 23, [54, 54, 62]);
    rect(p, 128, 45, 67, 55, 77, colors.warrior);
    rect(p, 128, 47, 64, 53, 69, colors.gold);
    rect(p, 128, 61, 74, 77, 79, [45, 45, 51]);
    rect(p, 128, 66, 70, 73, 75, [45, 45, 51]);
  } else if (building === 'inn') {
    wall(31, 43, 97);
    roofPlane(p, 61, 24, 37, 20, roof);
    gable(p, 61, 15, 38, 18, roof);
    // A warmly lit second storey, signboard and offset chimney make a tavern, not another hall.
    rect(p, 128, 31, 62, 97, 65, timber);
    for (const x of [43, 55, 73, 85]) window(p, x, 50, true);
    rect(p, 128, 68, 66, 77, baseline, timber);
    rect(p, 128, 24, 51, 32, 64, timber);
    rect(p, 128, 20, 52, 27, 59, colors.gold);
    rect(p, 128, 83, 24, 91, 45, [70, 58, 55]);
  } else {
    // Guardhouse: compact stone tower, crenellations, shield door and a tall signal pennant.
    wall(45, 40, 83);
    roofPlane(p, 64, 31, 22, 10, colors.guard);
    for (const x of [47, 57, 68, 78]) rect(p, 128, x, 35, x + 6, 43, wallLight);
    rect(p, 128, 57, 63, 71, baseline, [61, 75, 104]);
    diamondAt(p, 128, 64, 69, 6, 7, colors.gold);
    rect(p, 128, 64, 7, 67, 36, timber);
    for (let y = 9; y < 22; y++) rect(p, 128, 67, y, 77 - Math.floor((y - 9) / 3), y + 1, colors.gold);
  }
  if (state === 'damaged') {
    // Damage is visible as missing roof chunks and stone scars, while preserving the building identity.
    for (let y = 51; y < baseline; y += 13) rect(p, 128, 54, y, 60, y + 7, colors.rock);
    rect(p, 128, 72, 43, 81, 50, colors.rock);
  }
}
function unitSprite(
  p: Uint8Array,
  subject: string,
  action: string,
  facing: string,
  frame: number,
): void {
  const c = colors[subject as keyof typeof colors] ?? colors.goblin;
  const skin = [238, 203, 164] as const;
  const dark = [54, 47, 43] as const;
  const side = facing === 'e' ? 3 : facing === 'ne' ? 2 : facing === 'se' ? 1 : 0;
  const stride = frame % 2 === 0 ? 2 : -2;
  const body = (colour: readonly [number, number, number], wide = false): void => {
    for (let y = 20; y < 41; y++)
      for (let x = 6; x < 27; x++)
        if (Math.abs(x - 16) < (wide ? 5 : 3) + (y - 20) / 2.4) pixel(p, 32, x, y, colour);
    rect(p, 32, 11 + stride, 39, 14 + stride, 46, dark);
    rect(p, 32, 18 - stride, 39, 21 - stride, 46, dark);
  };
  const head = (colour: readonly [number, number, number] = skin): void => {
    for (let y = 9; y < 20; y++)
      for (let x = 11; x < 22; x++)
        if ((x - 16) * (x - 16) + (y - 14) * (y - 14) < 30) pixel(p, 32, x, y, colour);
  };
  const pole = (x: number, colour: readonly [number, number, number]): void =>
    rect(p, 32, x, 17, x + 2, 42, colour);
  const cap = (colour: readonly [number, number, number], brim = 0): void => {
    for (let y = 5; y < 13; y++) {
      const half = Math.floor((y - 4) / 2) + brim;
      rect(p, 32, 16 - half, y, 17 + half, y + 1, colour);
    }
  };

  if (subject === 'ratkin') {
    head([153, 133, 110]);
    body(c, false);
    // Pointed snout, ears and curling tail tell ratkin apart from a green humanoid.
    rect(p, 32, 19 + side, 14, 26 + side, 17, [153, 133, 110]);
    rect(p, 32, 11, 7, 14, 11, [153, 133, 110]);
    rect(p, 32, 19, 7, 22, 11, [153, 133, 110]);
    for (let x = 5; x < 10; x++) pixel(p, 32, x, 39 + (x - 5) / 2, [153, 133, 110]);
    pole(26 + side, colors.rock);
  } else if (subject === 'goblin' || subject === 'goblinRaider') {
    head([112, 139, 73]);
    body(c, true);
    // Oversized ears make the base goblin hunch; raiders add a shield and axe.
    rect(p, 32, 8, 9, 13, 13, [112, 139, 73]);
    rect(p, 32, 20, 9, 25, 13, [112, 139, 73]);
    if (subject === 'goblinRaider') {
      diamondAt(p, 32, 9, 29, 6, 8, [109, 80, 47]);
      pole(26 + side, [216, 220, 214]);
      rect(p, 32, 23 + side, 18, 30 + side, 21, [216, 220, 214]);
    } else {
      rect(p, 32, 25 + side, 23, 29 + side, 36, colors.rock);
    }
  } else {
    head();
    if (subject === 'peasant') {
      body(c);
      // Straw hat and hoe: civilian labour reads before the beige tunic does.
      cap(colors.gold, 3);
      pole(25 + side, [102, 72, 42]);
      rect(p, 32, 22 + side, 21, 31 + side, 24, [102, 72, 42]);
    } else if (subject === 'taxCollector') {
      body(c);
      rect(p, 32, 11, 7, 22, 11, [72, 52, 45]);
      rect(p, 32, 8, 10, 25, 13, [72, 52, 45]);
      rect(p, 32, 23 + side, 26, 30 + side, 34, [72, 52, 45]);
      diamondAt(p, 32, 27 + side, 33, 4, 5, colors.gold);
    } else if (subject === 'ranger') {
      body(c);
      cap(c, 1);
      // A bow curve and pale arrow distinguish ranged heroes from sword carriers.
      for (let y = 20; y < 39; y++) pixel(p, 32, 24 + side - Math.floor(Math.abs(y - 29) / 5), y, colors.gold);
      rect(p, 32, 18 + side, 28, 29 + side, 30, [226, 228, 218]);
    } else if (subject === 'rogue') {
      body(c);
      cap(c, 1);
      rect(p, 32, 5, 24, 9, 35, [226, 228, 218]);
      rect(p, 32, 24 + side, 26, 29 + side, 29, [226, 228, 218]);
    } else if (subject === 'warrior') {
      body(c, true);
      diamondAt(p, 32, 8, 29, 6, 8, [132, 139, 148]);
      pole(26 + side, [226, 228, 218]);
    } else if (subject === 'guard') {
      body(c, true);
      gable(p, 16, 7, 15, 6, [132, 139, 148]);
      diamondAt(p, 32, 8, 29, 6, 8, colors.guard);
      pole(26 + side, [226, 228, 218]);
    }
  }

  if (action === 'attack') {
    // Attacks must read as a committed pose, not a walking frame with a different
    // atlas name. The two samples alternate between a raised weapon and a strike.
    const swing = frame === 0 ? -1 : 1;
    const weapon = subject === 'ranger' ? colors.gold : [226, 228, 218] as const;
    for (let step = 0; step < 12; step++) {
      const x = 17 + side + step;
      const y = 28 + swing * step;
      pixel(p, 32, x, y, weapon);
      pixel(p, 32, x, y + 1, weapon);
    }
  }
}
async function main(): Promise<void> {
  // Frame names change as the art set grows. Leaving prior runs in place makes
  // the atlas non-idempotent and eventually packs sprites that no renderer uses.
  await rm(OUT, { recursive: true, force: true });
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
      for (const facing of ['ne', 'e', 'se', 's'])
        for (
          let frame = 0;
          frame < (action === 'walk' ? 4 : action === 'attack' ? 2 : 1);
          frame++
        )
          await write(
            `${subject}_${action}_${facing}_${String(frame).padStart(2, '0')}`,
            32,
            48,
            (p) => unitSprite(p, subject, action, facing, frame),
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
