import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Everything under public/ is copied verbatim into dist/ and downloaded by every
 * player on first load. Nothing there is requested by code unless it is one of
 * these three: the packed atlas, its frame table, and the asset manifest.
 *
 * This guard exists because 87d45b7 put 14 MB of concept sheets under
 * public/art-direction/ and 300 unpacked per-frame PNGs sat in public/atlas/src.
 * dist was 20 MB, 19 MB of which nothing ever asked for, and no gate objected.
 */
const SHIPPED = new Set(['atlas/game.json', 'atlas/game.png', 'assets.manifest.json']);

/** Generous next to the ~250 KB the allowlist actually weighs; catches a directory, not a byte. */
const BUDGET_BYTES = 1_000_000;

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}

describe('what the browser downloads', () => {
  const files = walk('public');

  it('serves only the assets the game actually loads', () => {
    const unexpected = files
      .map((path) => relative('public', path))
      .filter((path) => !SHIPPED.has(path))
      .sort();

    expect(unexpected, 'build inputs and reference material belong outside public/').toEqual([]);
  });

  it('stays inside its download budget', () => {
    const bytes = files.reduce((total, path) => total + statSync(path).size, 0);
    expect(bytes).toBeLessThan(BUDGET_BYTES);
  });
});
