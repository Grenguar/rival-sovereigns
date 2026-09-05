/**
 * C9 / C10 acceptance.
 *
 * C9 is "SHA-256 verified" and C10 is "verified by a deliberate bad entry", so the
 * two things this file must genuinely prove are:
 *
 *   1. A digest mismatch aborts the fetch and writes nothing.
 *   2. An asset with a missing or unconfirmed licence fails the credits build.
 *
 * Nothing here touches the network. `FetchIo` is injected, so the fetcher's real
 * control flow runs against in-memory fixtures.
 */

import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  type AssetEntry,
  type AssetManifest,
  type FetchIo,
  CONFIRMED_LICENCES,
  DigestMismatchError,
  LicenceGateError,
  MANIFEST_PATH,
  ManifestError,
  assertLicensed,
  fetchAssets,
  licenceProblems,
  parseManifest,
  sha256Hex,
} from '../tools/fetch-assets';
import { creditsFromRaw, renderCredits } from '../tools/gen-credits';

const bytes = (text: string): Uint8Array => new TextEncoder().encode(text);

const GOOD_BYTES = bytes('pretend this is a sprite sheet');
const GOOD_DIGEST = sha256Hex(GOOD_BYTES);

function entry(overrides: Partial<AssetEntry> = {}): AssetEntry {
  return {
    id: 'fixture-pack',
    title: 'Fixture Pack',
    path: 'assets/vendor/fixture.zip',
    author: 'A Real Person',
    licence: 'CC0-1.0',
    licenceUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
    sourcePage: 'https://example.org/fixture-pack',
    downloadUrl: 'https://example.org/fixture-pack.zip',
    sha256: GOOD_DIGEST,
    ...overrides,
  };
}

function manifest(...assets: AssetEntry[]): AssetManifest {
  return { version: 1, assets };
}

interface StubIo extends FetchIo {
  readonly written: Map<string, Uint8Array>;
  readonly downloads: string[];
}

function stubIo(
  remote: Record<string, Uint8Array>,
  disk: Record<string, Uint8Array> = {},
): StubIo {
  const written = new Map<string, Uint8Array>();
  const downloads: string[] = [];
  return {
    written,
    downloads,
    async download(url) {
      downloads.push(url);
      const found = remote[url];
      if (found === undefined) throw new Error(`stub has no bytes for ${url}`);
      return found;
    },
    async readIfPresent(path) {
      return written.get(path) ?? disk[path] ?? null;
    },
    async write(path, value) {
      written.set(path, value);
    },
  };
}

// ---------------------------------------------------------------------------

describe('C9 — SHA-256 verification', () => {
  test('a matching digest is downloaded and written', async () => {
    const io = stubIo({ 'https://example.org/fixture-pack.zip': GOOD_BYTES });

    const results = await fetchAssets(manifest(entry()), io);

    expect(results).toEqual([
      {
        id: 'fixture-pack',
        path: 'assets/vendor/fixture.zip',
        outcome: 'downloaded',
        sha256: GOOD_DIGEST,
      },
    ]);
    expect(io.written.get('assets/vendor/fixture.zip')).toEqual(GOOD_BYTES);
  });

  test('a mismatched digest throws and writes nothing', async () => {
    const tampered = bytes('pretend this is a sprite sheet plus a payload');
    const io = stubIo({ 'https://example.org/fixture-pack.zip': tampered });

    await expect(fetchAssets(manifest(entry()), io)).rejects.toThrow(DigestMismatchError);
    expect(io.written.size).toBe(0);
  });

  test('the mismatch message names both digests and the source', async () => {
    const tampered = bytes('not the reviewed bytes');
    const io = stubIo({ 'https://example.org/fixture-pack.zip': tampered });

    const error = await fetchAssets(manifest(entry()), io).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(DigestMismatchError);
    const message = (error as DigestMismatchError).message;
    expect(message).toContain(GOOD_DIGEST);
    expect(message).toContain(sha256Hex(tampered));
    expect(message).toContain('https://example.org/fixture-pack.zip');
  });

  test('one bad asset aborts the run before later assets are fetched', async () => {
    const second = entry({
      id: 'second-pack',
      path: 'assets/vendor/second.zip',
      downloadUrl: 'https://example.org/second.zip',
    });
    const io = stubIo({
      'https://example.org/fixture-pack.zip': bytes('wrong'),
      'https://example.org/second.zip': GOOD_BYTES,
    });

    await expect(fetchAssets(manifest(entry(), second), io)).rejects.toThrow(
      DigestMismatchError,
    );
    expect(io.downloads).toEqual(['https://example.org/fixture-pack.zip']);
  });

  test('is idempotent — a present, matching asset is not re-downloaded', async () => {
    const io = stubIo(
      { 'https://example.org/fixture-pack.zip': GOOD_BYTES },
      { 'assets/vendor/fixture.zip': GOOD_BYTES },
    );

    const results = await fetchAssets(manifest(entry()), io);

    expect(results[0]?.outcome).toBe('verified');
    expect(io.downloads).toEqual([]);
  });

  test('a stale local file is re-fetched and re-verified', async () => {
    const io = stubIo(
      { 'https://example.org/fixture-pack.zip': GOOD_BYTES },
      { 'assets/vendor/fixture.zip': bytes('an older release') },
    );

    const results = await fetchAssets(manifest(entry()), io);

    expect(results[0]?.outcome).toBe('downloaded');
    expect(io.downloads).toHaveLength(1);
    expect(io.written.get('assets/vendor/fixture.zip')).toEqual(GOOD_BYTES);
  });

  test('running twice in a row changes nothing the second time', async () => {
    const io = stubIo({ 'https://example.org/fixture-pack.zip': GOOD_BYTES });

    await fetchAssets(manifest(entry()), io);
    const second = await fetchAssets(manifest(entry()), io);

    expect(io.downloads).toHaveLength(1);
    expect(second[0]?.outcome).toBe('verified');
  });
});

// ---------------------------------------------------------------------------

describe('C9 — manifest schema', () => {
  test('the shipped assets.manifest.json is valid and fully licensed', () => {
    const raw: unknown = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
    const parsed = parseManifest(raw);

    expect(parsed.version).toBe(1);
    expect(() => assertLicensed(parsed.assets)).not.toThrow();
    for (const asset of parsed.assets) {
      expect(CONFIRMED_LICENCES).toContain(asset.licence);
    }
  });

  test('an unknown licence string is rejected at the schema boundary', () => {
    expect(() =>
      parseManifest(manifest(entry({ licence: 'MIT' as unknown as AssetEntry['licence'] }))),
    ).toThrow(ManifestError);
  });

  test('a non-hex or short digest is rejected', () => {
    expect(() => parseManifest(manifest(entry({ sha256: 'deadbeef' })))).toThrow(ManifestError);
    expect(() => parseManifest(manifest(entry({ sha256: GOOD_DIGEST.toUpperCase() })))).toThrow(
      ManifestError,
    );
  });

  test('a path that escapes the repo is rejected', () => {
    expect(() => parseManifest(manifest(entry({ path: '../../etc/passwd' })))).toThrow(
      ManifestError,
    );
    expect(() => parseManifest(manifest(entry({ path: '/etc/passwd' })))).toThrow(
      ManifestError,
    );
  });

  test('a plain-http download URL is rejected', () => {
    expect(() =>
      parseManifest(manifest(entry({ downloadUrl: 'http://example.org/fixture-pack.zip' }))),
    ).toThrow(ManifestError);
  });

  test('duplicate ids and duplicate destination paths are rejected', () => {
    expect(() => parseManifest(manifest(entry(), entry()))).toThrow(ManifestError);
    expect(() => parseManifest(manifest(entry(), entry({ id: 'other' })))).toThrow(
      ManifestError,
    );
  });

  test('unknown keys are rejected, so a typo is never silently ignored', () => {
    expect(() =>
      parseManifest(manifest({ ...entry(), licenseUrl: 'x' } as AssetEntry)),
    ).toThrow(ManifestError);
  });

  test('an empty manifest is valid — declaring nothing is always allowed', () => {
    expect(parseManifest({ version: 1, assets: [] }).assets).toEqual([]);
  });
});

// ---------------------------------------------------------------------------

describe('C10 — the licence gate fails the build on a deliberate bad entry', () => {
  test('an entry with no licence fails credits generation', () => {
    const bad = { ...entry() } as Partial<AssetEntry>;
    delete bad.licence;

    expect(() => renderCredits({ version: 1, assets: [bad as AssetEntry] })).toThrow(
      LicenceGateError,
    );
  });

  test('a deliberate bad entry driven through the real raw-JSON path fails', () => {
    // This is the C10 acceptance criterion: an asset whose licence nobody confirmed,
    // fed through exactly the pipeline `pnpm credits` uses.
    const raw = {
      version: 1,
      assets: [
        entry(),
        {
          id: 'mystery-tileset',
          title: 'Mystery Tileset',
          path: 'assets/vendor/mystery.png',
          author: 'unknown',
          licence: 'probably fine',
          downloadUrl: 'https://example.org/mystery.png',
        },
      ],
    };

    expect(() => creditsFromRaw(raw)).toThrow();
  });

  test('a structurally valid entry with an unciteable source still fails the gate', () => {
    // The schema cannot catch this one: every field it knows about is well-formed.
    // Only the gate knows that a third-party licence claim without a source page is
    // not a confirmed licence.
    const unciteable = entry({ id: 'unciteable' });
    delete (unciteable as Partial<AssetEntry>).sourcePage;

    expect(() => parseManifest(manifest(unciteable))).not.toThrow();
    expect(() => renderCredits(manifest(unciteable))).toThrow(LicenceGateError);
    expect(licenceProblems(unciteable).join('\n')).toContain('sourcePage');
  });

  test('every missing-attribution field is reported, not just the first', () => {
    const problems = licenceProblems({
      id: 'threadbare',
      title: 'Threadbare',
      path: 'assets/vendor/threadbare.png',
      author: 'TBD',
      licence: 'CC-BY-4.0',
    });

    expect(problems).toHaveLength(5);
    const joined = problems.join('\n');
    for (const field of ['author', 'sourcePage', 'licenceUrl', 'downloadUrl', 'sha256']) {
      expect(joined).toContain(field);
    }
  });

  test('a self-made asset needs an author but no source page or digest', () => {
    const selfMade: AssetEntry = {
      id: 'placeholder-sprites',
      title: 'Procedural placeholder sprites',
      path: 'public/atlas/game.png',
      author: 'Sovereign contributors',
      licence: 'self-made',
    };

    expect(licenceProblems(selfMade)).toEqual([]);
    expect(renderCredits(manifest(selfMade))).toContain('Procedural placeholder sprites');
  });

  test('the LicenceGateError lists every offending asset at once', () => {
    const error = (() => {
      try {
        assertLicensed([
          { id: 'a', title: 'A', author: 'unknown', licence: 'self-made' },
          { id: 'b', title: 'B', author: 'B Person' },
        ]);
        return null;
      } catch (e) {
        return e as LicenceGateError;
      }
    })();

    expect(error).toBeInstanceOf(LicenceGateError);
    expect(error?.problems.some((p) => p.startsWith('a:'))).toBe(true);
    expect(error?.problems.some((p) => p.startsWith('b:'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------

describe('C10 — CREDITS.md is deterministic', () => {
  test('rendering twice produces identical bytes', () => {
    const m = manifest(entry(), entry({ id: 'zzz', path: 'assets/vendor/z.zip' }));
    expect(renderCredits(m)).toBe(renderCredits(m));
  });

  test('manifest order does not affect the output', () => {
    const a = entry({ id: 'aaa', path: 'assets/vendor/a.zip' });
    const z = entry({ id: 'zzz', path: 'assets/vendor/z.zip' });
    expect(renderCredits(manifest(a, z))).toBe(renderCredits(manifest(z, a)));
  });

  test('no timestamp or other varying token leaks into the output', () => {
    const rendered = renderCredits(manifest(entry()));
    expect(rendered).not.toMatch(/\b(19|20)\d{2}-\d{2}-\d{2}\b/);
    expect(rendered).not.toMatch(/\bGMT\b|\bUTC\b/);
  });

  test('an empty manifest still renders a valid, honest CREDITS.md', () => {
    const rendered = renderCredits({ version: 1, assets: [] });
    expect(rendered).toContain('# Credits');
    expect(rendered).toContain('None.');
  });

  test('the checked-in CREDITS.md matches what the generator produces', () => {
    const raw: unknown = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
    const expected = renderCredits(parseManifest(raw));
    const actual = readFileSync(new URL('../CREDITS.md', import.meta.url), 'utf8');
    expect(actual).toBe(expected);
  });

  test('every credited asset carries author, licence and source', () => {
    const raw: unknown = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
    const parsed = parseManifest(raw);
    const rendered = renderCredits(parsed);
    for (const asset of parsed.assets) {
      expect(rendered).toContain(asset.author);
      expect(rendered).toContain(asset.licence);
      if (asset.sourcePage) expect(rendered).toContain(asset.sourcePage);
    }
  });
});
