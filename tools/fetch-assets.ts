/**
 * C9 — manifest-driven third-party asset download with SHA-256 verification.
 *
 *   pnpm assets:fetch
 *
 * `assets.manifest.json` is the single declaration of every third-party asset the
 * project ships. Nothing enters `assets/vendor/` any other way: if it is not in the
 * manifest with a confirmed licence and a pinned digest, it does not exist.
 *
 * Two properties this file exists to guarantee:
 *
 *   1. **Digest mismatch is fatal, never a warning.** The manifest pins the exact
 *      bytes we reviewed the licence of. If the upstream file no longer hashes to
 *      that value, the thing we are about to ship is not the thing we cleared — that
 *      is a supply-chain event, so we abort with a non-zero exit and touch nothing.
 *   2. **Idempotence.** An asset already on disk whose bytes match its pinned digest
 *      is skipped, not re-downloaded. Running this twice costs one stat and one hash
 *      per entry.
 *
 * Everything except `nodeIo` is pure and network-free, so the verification logic is
 * unit-testable without touching the network — see `tests/assets.spec.ts`.
 */

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

/**
 * docs/AGENTS.md §5: "Every shipped asset is CC0, CC-BY, or self-made."
 *
 * This list is the whole of the permitted set and is deliberately spelled with
 * explicit versions — "CC-BY" without a version is not a licence, it is a family,
 * and the attribution terms differ between 3.0 and 4.0.
 */
export const CONFIRMED_LICENCES = ['CC0-1.0', 'CC-BY-3.0', 'CC-BY-4.0', 'self-made'] as const;

export type Licence = (typeof CONFIRMED_LICENCES)[number];

const Sha256Schema = z
  .string()
  .regex(/^[0-9a-f]{64}$/, 'sha256 must be 64 lowercase hex characters');

/**
 * Destination paths are repo-relative and may not escape the repo. A manifest is a
 * config file that a fetcher writes to disk from — path traversal in it is a write
 * primitive, so it is rejected at the schema boundary rather than downstream.
 */
const RepoPathSchema = z
  .string()
  .min(1)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._/-]*$/, 'path must be a plain relative path')
  .refine((p) => !p.split('/').includes('..'), { message: 'path must not contain ".."' })
  .refine((p) => !p.endsWith('/'), { message: 'path must name a file, not a directory' });

const HttpsUrlSchema = z
  .string()
  .url()
  .refine((u) => u.startsWith('https://'), { message: 'must be an https:// URL' });

export const AssetEntrySchema = z
  .object({
    /** Stable slug. Also the sort key for CREDITS.md, so it must never be reused. */
    id: z
      .string()
      .min(1)
      .regex(/^[a-z0-9][a-z0-9-]*$/, 'id must be a lowercase slug'),
    /** Human title as it appears on the source page. */
    title: z.string().min(1),
    /** Where the fetched bytes land, relative to the repo root. */
    path: RepoPathSchema,
    /** Named exactly as the source requires them to be credited. */
    author: z.string().min(1),
    licence: z.enum(CONFIRMED_LICENCES),
    /** The licence deed itself, so a reader can check our reading of it. */
    licenceUrl: HttpsUrlSchema.optional(),
    /** The page the licence was read off. This is the evidence, not decoration. */
    sourcePage: HttpsUrlSchema.optional(),
    /** Direct, version-pinned download. */
    downloadUrl: HttpsUrlSchema.optional(),
    /** Digest of the exact bytes whose licence was confirmed. */
    sha256: Sha256Schema.optional(),
    /** Advisory only — the digest is what is authoritative. */
    bytes: z.number().int().positive().optional(),
    note: z.string().min(1).optional(),
  })
  .strict();

export type AssetEntry = z.infer<typeof AssetEntrySchema>;

export const AssetManifestSchema = z
  .object({
    version: z.literal(1),
    assets: z.array(AssetEntrySchema),
  })
  .strict()
  .superRefine((manifest, ctx) => {
    const seenIds = new Set<string>();
    const seenPaths = new Set<string>();
    for (const [index, asset] of manifest.assets.entries()) {
      if (seenIds.has(asset.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['assets', index, 'id'],
          message: `duplicate asset id "${asset.id}"`,
        });
      }
      seenIds.add(asset.id);

      if (seenPaths.has(asset.path)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['assets', index, 'path'],
          message: `two assets both write to "${asset.path}"`,
        });
      }
      seenPaths.add(asset.path);
    }
  });

export type AssetManifest = z.infer<typeof AssetManifestSchema>;

export class ManifestError extends Error {
  override readonly name = 'ManifestError';
}

/** Parses and validates raw JSON. Throws `ManifestError` with every issue listed. */
export function parseManifest(raw: unknown): AssetManifest {
  const result = AssetManifestSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  ${issue.path.join('.') || '<root>'}: ${issue.message}`)
      .join('\n');
    throw new ManifestError(`assets.manifest.json is invalid:\n${issues}`);
  }
  return result.data;
}

// ---------------------------------------------------------------------------
// The licence gate
// ---------------------------------------------------------------------------

export class LicenceGateError extends Error {
  override readonly name = 'LicenceGateError';
  readonly problems: readonly string[];

  constructor(problems: readonly string[]) {
    super(
      `Licence gate failed — ${problems.length} problem(s). docs/AGENTS.md §5: every shipped asset is CC0, CC-BY or self-made.\n` +
        problems.map((p) => `  - ${p}`).join('\n'),
    );
    this.problems = problems;
  }
}

/** Values people type when they mean "I did not actually check". */
const PLACEHOLDER_AUTHORS = new Set([
  '',
  '?',
  '-',
  'n/a',
  'na',
  'tbd',
  'todo',
  'unknown',
  'anonymous',
  'various',
]);

/**
 * Returns every reason `entry` may not ship. Empty array means it may.
 *
 * This deliberately re-checks things the zod schema also enforces. The schema
 * protects the manifest file; this protects the *credits*, and it is called on
 * entries that may have reached us by other routes (a test fixture, a partially
 * edited object). A gate that trusts its caller is not a gate.
 *
 * The rules go beyond the schema in one important way: for anything not self-made,
 * a source page is **required**, because "I confirmed the licence" is a claim that
 * must be checkable by whoever reads CREDITS.md next.
 */
export function licenceProblems(entry: Readonly<Partial<AssetEntry>>): string[] {
  const problems: string[] = [];
  const id = entry.id ?? '<unnamed asset>';

  const licence = entry.licence;
  if (licence === undefined) {
    problems.push(`${id}: no licence declared`);
  } else if (!(CONFIRMED_LICENCES as readonly string[]).includes(licence)) {
    problems.push(
      `${id}: licence "${licence}" is not confirmed — permitted: ${CONFIRMED_LICENCES.join(', ')}`,
    );
  }

  const author = (entry.author ?? '').trim();
  if (PLACEHOLDER_AUTHORS.has(author.toLowerCase())) {
    problems.push(`${id}: author is missing or a placeholder ("${entry.author ?? ''}")`);
  }

  if (!entry.title || entry.title.trim() === '') {
    problems.push(`${id}: no title`);
  }

  if (licence !== 'self-made') {
    if (!entry.sourcePage) {
      problems.push(`${id}: no sourcePage — the licence cannot be confirmed without one`);
    }
    if (!entry.licenceUrl) {
      problems.push(`${id}: no licenceUrl — cite the deed the licence was read from`);
    }
    if (!entry.downloadUrl) {
      problems.push(
        `${id}: no downloadUrl — third-party assets must be reproducibly fetchable`,
      );
    }
    if (!entry.sha256) {
      problems.push(
        `${id}: no sha256 — the bytes the licence was confirmed against are unpinned`,
      );
    }
  }

  return problems;
}

/** Throws `LicenceGateError` unless every entry is fully licensed and attributable. */
export function assertLicensed(entries: readonly Readonly<Partial<AssetEntry>>[]): void {
  const problems = entries.flatMap((entry) => licenceProblems(entry));
  if (problems.length > 0) throw new LicenceGateError(problems);
}

// ---------------------------------------------------------------------------
// Verification
// ---------------------------------------------------------------------------

export function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export class DigestMismatchError extends Error {
  override readonly name = 'DigestMismatchError';

  constructor(
    readonly assetId: string,
    readonly source: string,
    readonly expected: string,
    readonly actual: string,
  ) {
    super(
      `SHA-256 MISMATCH for "${assetId}" from ${source}\n` +
        `  expected ${expected}\n` +
        `  actual   ${actual}\n` +
        'The upstream bytes are not the bytes whose licence was confirmed. This is a ' +
        'supply-chain event, not a warning: nothing has been written. Re-review the ' +
        'source page and, only if the change is legitimate, update the manifest digest.',
    );
  }
}

// ---------------------------------------------------------------------------
// Fetching
// ---------------------------------------------------------------------------

/** Injected so the whole pipeline can be exercised without a network or a disk. */
export interface FetchIo {
  /** Resolves the bytes at `url`, or rejects. */
  readonly download: (url: string) => Promise<Uint8Array>;
  /** Resolves the bytes at repo-relative `path`, or `null` if absent. */
  readonly readIfPresent: (path: string) => Promise<Uint8Array | null>;
  /** Writes bytes to repo-relative `path`, creating parent directories. */
  readonly write: (path: string, bytes: Uint8Array) => Promise<void>;
}

export type AssetOutcome =
  /** Present on disk and matching its pinned digest. Nothing was done. */
  | 'verified'
  /** Downloaded, digest checked, written. */
  | 'downloaded'
  /** Self-made or otherwise not fetchable; no download attempted. */
  | 'local';

export interface AssetResult {
  readonly id: string;
  readonly path: string;
  readonly outcome: AssetOutcome;
  readonly sha256: string | null;
}

export const REPO_ROOT = resolve(import.meta.dirname, '..');

export const MANIFEST_PATH = resolve(REPO_ROOT, 'assets.manifest.json');

export const nodeIo: FetchIo = {
  async download(url) {
    const response = await fetch(url, { redirect: 'follow' });
    if (!response.ok) {
      throw new Error(`GET ${url} -> HTTP ${response.status} ${response.statusText}`);
    }
    return new Uint8Array(await response.arrayBuffer());
  },
  async readIfPresent(path) {
    try {
      return new Uint8Array(await readFile(resolve(REPO_ROOT, path)));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  },
  async write(path, bytes) {
    const target = resolve(REPO_ROOT, path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, bytes);
  },
};

/**
 * Downloads and verifies every entry.
 *
 * Runs the licence gate first: refusing to fetch an unlicensed asset is cheaper than
 * deleting it afterwards, and an asset on disk has a way of ending up in an atlas.
 */
export async function fetchAssets(
  manifest: AssetManifest,
  io: FetchIo,
  log: (message: string) => void = () => {},
): Promise<AssetResult[]> {
  assertLicensed(manifest.assets);

  const results: AssetResult[] = [];

  for (const asset of manifest.assets) {
    const { id, path, downloadUrl, sha256 } = asset;

    if (downloadUrl === undefined || sha256 === undefined) {
      log(`  local     ${id} -> ${path}`);
      results.push({ id, path, outcome: 'local', sha256: sha256 ?? null });
      continue;
    }

    const existing = await io.readIfPresent(path);
    if (existing !== null) {
      const digest = sha256Hex(existing);
      if (digest === sha256) {
        log(`  verified  ${id} -> ${path}`);
        results.push({ id, path, outcome: 'verified', sha256: digest });
        continue;
      }
      // A local file that no longer matches is stale or corrupt, not an attack —
      // the manifest is authoritative, so re-fetch and let the download's own
      // verification decide whether anything is actually wrong.
      log(
        `  stale     ${id} (${digest.slice(0, 12)}… != ${sha256.slice(0, 12)}…), re-fetching`,
      );
    }

    const downloaded = await io.download(downloadUrl);
    const digest = sha256Hex(downloaded);
    if (digest !== sha256) {
      throw new DigestMismatchError(id, downloadUrl, sha256, digest);
    }

    await io.write(path, downloaded);
    log(`  fetched   ${id} -> ${path} (${downloaded.byteLength} bytes)`);
    results.push({ id, path, outcome: 'downloaded', sha256: digest });
  }

  return results;
}

/** Reads and validates `assets.manifest.json`. */
export async function loadManifest(path: string = MANIFEST_PATH): Promise<AssetManifest> {
  let text: string;
  try {
    text = await readFile(path, 'utf8');
  } catch {
    throw new ManifestError(`cannot read ${path}`);
  }

  let raw: unknown;
  try {
    raw = JSON.parse(text) as unknown;
  } catch (error) {
    throw new ManifestError(`${path} is not valid JSON: ${(error as Error).message}`);
  }

  return parseManifest(raw);
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const manifest = await loadManifest();
  console.log(`fetch-assets: ${manifest.assets.length} entr(ies) in assets.manifest.json`);

  const results = await fetchAssets(manifest, nodeIo, (message) => {
    console.log(message);
  });

  const counts = { verified: 0, downloaded: 0, local: 0 };
  for (const result of results) counts[result.outcome] += 1;
  console.log(
    `fetch-assets: ${counts.downloaded} downloaded, ${counts.verified} already verified, ${counts.local} local`,
  );
}

const invokedPath = process.argv[1];
if (invokedPath !== undefined && resolve(invokedPath) === fileURLToPath(import.meta.url)) {
  try {
    await main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
