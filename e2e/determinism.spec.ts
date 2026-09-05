import { expect, test } from '@playwright/test';
import { runHarness } from '../src/harness/determinism';
import { GOLDEN_SEED, GOLDEN_TICKS } from '../src/harness/golden';

/**
 * The canary, run for real.
 *
 * Node computes the reference here in-process; each browser project computes the
 * same thing in its own engine. A mismatch means a calculation somewhere in
 * src/core produces different bits on different engines — which is a blocking bug,
 * never a tolerance to widen (docs/03-determinism.md §6).
 */
const reference = runHarness();

test('the simulation hashes identically to Node in this engine', async ({ page }, testInfo) => {
  await page.goto('/determinism.html');

  const result = await page.waitForFunction(
    () => (window as unknown as { __DETERMINISM__?: unknown }).__DETERMINISM__ ?? null,
    undefined,
    { timeout: 150_000 },
  );
  const actual = (await result.jsonValue()) as typeof reference;

  expect(actual.seed).toBe(GOLDEN_SEED);
  expect(actual.ticks).toBe(GOLDEN_TICKS);

  // Compare checkpoints before the final hash: if they diverge, the first differing
  // checkpoint bounds the tick range to bisect, which is step 2 of the §6 playbook.
  for (let i = 0; i < reference.checkpoints.length; i++) {
    const expected = reference.checkpoints[i]!;
    const got = actual.checkpoints[i];
    expect(
      got,
      `${testInfo.project.name} is missing checkpoint at tick ${expected.tick}`,
    ).toBeDefined();
    expect(
      got!.hash,
      `${testInfo.project.name} diverged from Node by tick ${expected.tick}`,
    ).toBe(expected.hash);
  }

  expect(actual.hash).toBe(reference.hash);
});

test('two runs in the same engine agree', async ({ page }) => {
  await page.goto('/determinism.html');
  const first = await page
    .waitForFunction(() => (window as unknown as { __DETERMINISM__?: { hash: number } }).__DETERMINISM__ ?? null)
    .then((h) => h.jsonValue() as Promise<{ hash: number }>);

  await page.reload();
  const second = await page
    .waitForFunction(() => (window as unknown as { __DETERMINISM__?: { hash: number } }).__DETERMINISM__ ?? null)
    .then((h) => h.jsonValue() as Promise<{ hash: number }>);

  expect(second.hash).toBe(first.hash);
});
