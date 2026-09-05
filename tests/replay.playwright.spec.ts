import { expect, test } from '@playwright/test';
import { GOLDEN_REPLAY_HASH } from './replay-runner';

declare global {
  interface Window {
    replayHash: () => number;
  }
}

test.describe('golden replay determinism', () => {
  test('matches Node at tick 10,000', async ({ page }) => {
    await page.goto('/tests/replay.browser.html');
    await expect
      .poll(() => page.evaluate(() => window.replayHash?.()))
      .toBe(GOLDEN_REPLAY_HASH);
  });
});
