import { expect, test } from '@playwright/test';

test.describe('Pixi map surface', () => {
  test('loads the atlas-backed Mission 01 terrain without page errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));

    await page.goto('/');
    await expect(page.locator('canvas')).toBeVisible();
    await expect
      .poll(() =>
        page
          .locator('canvas')
          .evaluate(
            (node) => node instanceof HTMLCanvasElement && node.width > 0 && node.height > 0,
          ),
      )
      .toBe(true);
    expect(errors).toEqual([]);
  });
});
