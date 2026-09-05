import { readFile, writeFile } from 'node:fs/promises';
interface Asset { name: string; url: string; license: string; author: string; sourcePage: string; sha256: string; }
async function main(): Promise<void> { const assets = JSON.parse(await readFile('public/assets.manifest.json', 'utf8')) as Asset[]; for (const asset of assets) if (!['CC0', 'CC-BY', 'self-made'].includes(asset.license) || !asset.sha256) throw new Error(`Invalid asset manifest entry: ${asset.name}`); const text = ['# Credits', '', ...assets.map((a) => `- **${a.name}** — ${a.license}; ${a.author}; ${a.sourcePage}`), ''].join('\n'); await writeFile('CREDITS.md', text); console.log(`gen-credits: wrote ${assets.length} entries`); }
void main();
