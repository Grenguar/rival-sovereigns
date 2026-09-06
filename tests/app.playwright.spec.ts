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

  test('keeps chrome above the world-space overlays that drift beneath it', async ({ page }) => {
    await page.goto('/');

    // World labels, flag labels and floating damage numbers are positioned from
    // camera coordinates, so a hero walking behind the treasury panel will put a
    // name badge over it unless the chrome outranks every world layer.
    // Read the rules rather than the elements: the inspector only mounts once a
    // hero is selected, but its layering is part of the same contract.
    const zIndex = async (selector: string): Promise<number> =>
      page.evaluate((want) => {
        for (const sheet of Array.from(document.styleSheets))
          for (const rule of Array.from(sheet.cssRules))
            if (rule instanceof CSSStyleRule && rule.selectorText.endsWith(want))
              return Number(rule.style.zIndex);
        throw new Error(`no rule sets z-index for ${want}`);
      }, selector);

    const chrome = Math.min(await zIndex('.rs-hud'), await zIndex('.rs-inspector'));
    for (const world of ['.rs-world-labels', '.rs-flag-labels', '.rs-event-overlay'])
      expect(await zIndex(world), `${world} must sit under the chrome`).toBeLessThan(chrome);
  });
});
