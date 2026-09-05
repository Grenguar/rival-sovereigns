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

  test('mounts build and bounty controls instead of leaving the HUD as the only verb', async ({
    page,
  }) => {
    await page.goto('/');

    await page.getByRole('button', { name: 'Build', exact: true }).click();
    await expect(page.getByRole('region', { name: 'Build menu' })).toBeVisible();
    await expect(page.getByText('Choose a building first.')).toBeVisible();

    await page.getByRole('button', { name: 'Attack bounty' }).click();
    await expect(page.getByRole('button', { name: 'Explore bounty' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    await expect(page.getByRole('button', { name: 'Pause game' })).toBeVisible();
  });
});
