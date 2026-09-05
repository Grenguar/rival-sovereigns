import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { encodePng } from './png';

const OUT = 'public/atlas/src';
const colors = { grass: [90, 139, 74], forest: [67, 107, 57], water: [58, 107, 145], rock: [142, 142, 150], road: [138, 111, 74], warrior: [196, 69, 58], ranger: [63, 158, 92], rogue: [139, 95, 191], ratkin: [122, 106, 74], goblin: [104, 129, 56], gold: [232, 185, 60] } as const;
const frames = ['terrain_grass', 'terrain_forest', 'terrain_water', 'terrain_rock', 'terrain_road', 'flag_attack', 'flag_explore', 'fx_dust', 'fx_decal'];
const subjects = ['warrior', 'ranger', 'rogue', 'ratkin', 'goblin', 'goblinRaider'];
const buildings = ['palace', 'warriorsGuild', 'roguesGuild', 'rangersLodge', 'marketplace', 'blacksmith', 'inn', 'guardhouse'];

async function write(name: string, width: number, height: number, paint: (p: Uint8Array) => void): Promise<void> { const p = new Uint8Array(width * height * 4); paint(p); await writeFile(join(OUT, `${name}.png`), encodePng({ width, height, pixels: p })); }
function pixel(p: Uint8Array, w: number, x: number, y: number, c: readonly [number, number, number], a = 255): void { if (x < 0 || y < 0 || x >= w || y >= p.length / w / 4) return; const i = (y * w + x) * 4; p[i] = c[0]; p[i + 1] = c[1]; p[i + 2] = c[2]; p[i + 3] = a; }
function diamond(p: Uint8Array, w: number, h: number, c: readonly [number, number, number]): void { for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (Math.abs(x - w / 2) / (w / 2) + Math.abs(y - h / 2) / (h / 2) <= 1) pixel(p, w, x, y, [c[0] - (y > h / 2 ? 18 : 0), c[1] - (x < w / 2 ? 12 : 0), c[2]], 255); }
async function main(): Promise<void> {
  await mkdir(OUT, { recursive: true });
  for (const name of frames) await write(name, 64, 40, (p) => { if (name.startsWith('terrain')) diamond(p, 64, 32, colors[name.slice(8) as keyof typeof colors] ?? colors.grass); else if (name.startsWith('flag')) { diamond(p, 64, 32, colors.grass); for (let y = 0; y < 32; y++) pixel(p, 64, 31, y, colors.gold); for (let y = 4; y < 15; y++) for (let x = 32; x < 48; x++) pixel(p, 64, x, y, name.endsWith('attack') ? colors.warrior : colors.ranger); } else { for (let y = 12; y < 28; y++) for (let x = 20; x < 44; x++) pixel(p, 64, x, y, name === 'fx_decal' ? [122, 83, 52] : colors.gold, 170); } });
  for (const subject of subjects) for (const action of ['idle', 'walk', 'attack']) for (let frame = 0; frame < (action === 'walk' ? 4 : action === 'attack' ? 2 : 1); frame++) await write(`${subject}_${action}_s_${String(frame).padStart(2, '0')}`, 32, 48, (p) => { const c = colors[subject as keyof typeof colors] ?? colors.goblin; for (let y = 9; y < 42; y++) for (let x = 7; x < 25; x++) if ((x - 16) * (x - 16) + (y - 18) * (y - 18) < 90 || (y > 18 && Math.abs(x - 16) < 7)) pixel(p, 32, x, y, c); pixel(p, 32, 16, 8 + frame % 3, colors.gold); });
  for (const building of buildings) for (const state of ['intact', 'construction', 'damaged', 'rubble']) await write(`${building}_${state}`, 128, 112, (p) => { diamond(p, 128, 64, state === 'rubble' ? colors.rock : colors.road); const roof = building.includes('rogue') ? colors.rogue : building.includes('ranger') ? colors.ranger : colors.warrior; const height = state === 'rubble' ? 12 : state === 'construction' ? 28 : 52; for (let y = 56 - height; y < 56; y++) for (let x = 36; x < 92; x++) pixel(p, 128, x, y, state === 'damaged' && x % 8 < 2 ? colors.rock : roof); });
  console.log(`make-placeholders: wrote Stage A sprites to ${OUT}`);
}
void main();
