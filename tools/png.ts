import { deflateSync, inflateSync } from 'node:zlib';

export interface Png { width: number; height: number; pixels: Uint8Array; }
const signature = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);

export function encodePng({ width, height, pixels }: Png): Uint8Array {
  const raw = new Uint8Array((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) raw.set(pixels.subarray(y * width * 4, (y + 1) * width * 4), y * (width * 4 + 1) + 1);
  return join(signature, chunk('IHDR', header(width, height)), chunk('IDAT', deflateSync(raw)), chunk('IEND', new Uint8Array()));
}

export function decodePng(data: Uint8Array): Png {
  let offset = 8, width = 0, height = 0; const parts: Uint8Array[] = [];
  while (offset < data.length) {
    const length = read32(data, offset); const type = ascii(data.subarray(offset + 4, offset + 8)); const body = data.subarray(offset + 8, offset + 8 + length); offset += length + 12;
    if (type === 'IHDR') { width = read32(body, 0); height = read32(body, 4); if (body[8] !== 8 || body[9] !== 6) throw new Error('Only RGBA PNGs are supported.'); }
    if (type === 'IDAT') parts.push(body);
  }
  const raw = inflateSync(join(...parts)); const pixels = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) { const start = y * (width * 4 + 1); if (raw[start] !== 0) throw new Error('Only filter-zero PNGs are supported.'); pixels.set(raw.subarray(start + 1, start + 1 + width * 4), y * width * 4); }
  return { width, height, pixels };
}

function header(w: number, h: number): Uint8Array { const a = new Uint8Array(13); put32(a, 0, w); put32(a, 4, h); a[8] = 8; a[9] = 6; return a; }
function chunk(type: string, body: Uint8Array): Uint8Array { const name = Uint8Array.from(type, (c) => c.charCodeAt(0)); const out = new Uint8Array(body.length + 12); put32(out, 0, body.length); out.set(name, 4); out.set(body, 8); put32(out, body.length + 8, crc32(join(name, body))); return out; }
function join(...arrays: Uint8Array[]): Uint8Array { const size = arrays.reduce((sum, item) => sum + item.length, 0); const out = new Uint8Array(size); let at = 0; for (const item of arrays) { out.set(item, at); at += item.length; } return out; }
function read32(data: Uint8Array, at: number): number { return ((data[at] ?? 0) * 0x1000000 + (data[at + 1] ?? 0) * 0x10000 + (data[at + 2] ?? 0) * 0x100 + (data[at + 3] ?? 0)) >>> 0; }
function put32(data: Uint8Array, at: number, value: number): void { data[at] = value >>> 24; data[at + 1] = value >>> 16; data[at + 2] = value >>> 8; data[at + 3] = value; }
function ascii(data: Uint8Array): string { return String.fromCharCode(...data); }
function crc32(data: Uint8Array): number { let crc = 0xffffffff; for (const byte of data) { crc ^= byte; for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (-(crc & 1) & 0xedb88320); } return (crc ^ 0xffffffff) >>> 0; }
