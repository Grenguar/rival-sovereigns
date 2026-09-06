import { expect, test, type Page } from '@playwright/test';

/**
 * The share of minimap pixels that are fog-dark.
 *
 * The main view is a WebGL canvas whose drawing buffer is not readable after the
 * frame, and Playwright's screenshots are not RGBA so the repo's PNG decoder will
 * not take them. The minimap is a 2D canvas drawn from the same fog grid, so it is
 * both readable and the honest place to assert that fog reaches the UI at all.
 */
async function fogFraction(page: Page): Promise<number> {
  return page.evaluate(() => {
    const canvas = document.querySelector('.rs-minimap__canvas');
    if (!(canvas instanceof HTMLCanvasElement)) throw new Error('no minimap canvas');
    const ctx = canvas.getContext('2d');
    if (ctx === null) throw new Error('no 2d context');
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let dark = 0;
    for (let i = 0; i < data.length; i += 4)
      if ((data[i] ?? 0) + (data[i + 1] ?? 0) + (data[i + 2] ?? 0) < 90) dark++;
    return dark / (data.length / 4);
  });
}

/**
 * Freezes the simulation so a world label becomes a fixed probe for camera motion.
 *
 * Without this the probe is a walking hero, and a test asking "did the camera stop
 * when I released the key?" instead measures how far the hero got. Camera changes
 * still re-render the labels while paused, so the probe stays live.
 */
async function pause(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Pause game' }).click();
  await page.waitForTimeout(150);
}

/** Where the first world label currently sits, as a movement probe for the camera. */
async function labelX(page: Page): Promise<number> {
  return Number(
    (
      await page
        .locator('.rs-world-label')
        .first()
        .evaluate((node) => (node as HTMLElement).style.left)
    ).replace('px', ''),
  );
}

test.describe('RTS camera and fog', () => {
  test('hides the map it has not seen, and reveals what it has', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.rs-minimap__canvas')).toBeVisible();
    await page.waitForTimeout(2500);

    const fog = await fogFraction(page);
    // A 96x96 map lit only around the palace. Fog that covers everything means the
    // grid never reached the UI; fog that covers nothing means it is not applied.
    expect(fog, 'most of a fresh map is unexplored').toBeGreaterThan(0.9);
    expect(fog, 'the kingdom itself must be visible').toBeLessThan(0.999);
  });

  test('drops hero names as the camera pulls back', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000);
    expect(await page.locator('.rs-hero-name').count()).toBeGreaterThan(0);

    const size = page.viewportSize() ?? { width: 1280, height: 720 };
    await page.mouse.move(size.width / 2, size.height / 2);
    for (let i = 0; i < 6; i++) {
      await page.mouse.wheel(0, 240);
      await page.waitForTimeout(80);
    }

    // A name is a fixed number of screen pixels at any zoom, so at map scale they
    // stack into an unreadable pile. Semantic zoom drops them and keeps the bars.
    await expect(page.locator('.rs-hero-name')).toHaveCount(0);
  });

  test('pans with the keyboard and does not run on after the key is released', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000);
    await pause(page);

    const before = await labelX(page);
    await page.keyboard.down('ArrowRight');
    await page.waitForTimeout(250);
    await page.keyboard.up('ArrowRight');
    await page.waitForTimeout(150);
    const afterRelease = await labelX(page);

    expect(Math.abs(afterRelease - before), 'holding a key must move the camera').toBeGreaterThan(40);

    await page.waitForTimeout(600);
    // A held-key set that is never cleared on keyup or window blur leaves the map
    // scrolling forever, which is the classic version of this bug.
    expect(await labelX(page)).toBeCloseTo(afterRelease, 0);
  });

  test('leaves arrow keys to a focused control instead of panning', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000);

    // Not paused: the tax slider is bound to simulation state, so its value cannot
    // move while the command queue is frozen.
    const slider = page.locator('input[type="range"]').first();
    await slider.focus();
    const before = await labelX(page);
    const rate = await slider.inputValue();

    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(250);

    expect(await slider.inputValue(), 'the slider owns its own arrow keys').not.toBe(rate);
    // A pan would move the world by roughly 200px; a hero walking for the same
    // quarter-second moves a small fraction of that.
    expect(Math.abs((await labelX(page)) - before)).toBeLessThan(60);
  });

  test('jumps the camera where the minimap is clicked', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000);
    await pause(page);
    expect(await page.locator('.rs-world-label').count()).toBeGreaterThan(0);

    const minimap = page.getByRole('img', { name: 'Kingdom minimap' });
    await expect(minimap).toBeVisible();
    const box = await minimap.boundingBox();
    expect(box).not.toBeNull();
    const clickAt = async (fx: number, fy: number): Promise<void> => {
      await page.mouse.click((box?.x ?? 0) + (box?.width ?? 0) * fx, (box?.y ?? 0) + (box?.height ?? 0) * fy);
      await page.waitForTimeout(250);
    };

    // The far south-west corner is empty map, so every hero label leaving the DOM
    // is the proof the camera actually went there.
    await clickAt(0.12, 0.88);
    await expect(page.locator('.rs-world-label')).toHaveCount(0);

    // The palace sits near tile (40, 52) of 96, so this is the way home.
    await clickAt(0.42, 0.54);
    expect(await page.locator('.rs-world-label').count()).toBeGreaterThan(0);
  });

  test('zooms from its own buttons, not only from an undiscoverable wheel', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000);
    await pause(page);

    const before = await labelX(page);
    await page.getByTitle(/Zoom in/).click();
    await page.waitForTimeout(250);

    expect(Math.abs((await labelX(page)) - before)).toBeGreaterThan(5);
  });

  test('renders the approved Catalan atlas and opens real building actions', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000);

    const frameNames = await page.evaluate(async () => {
      const atlas = (await (await fetch('/atlas/game.json')).json()) as { frames: Record<string, unknown> };
      return Object.keys(atlas.frames);
    });
    expect(frameNames).toEqual(expect.arrayContaining([
      'palace_intact',
      'warriorsGuild_intact',
      'prop_oliveTree',
      'prop_shorelineRocks',
      'terrain_water_2',
    ]));

    const size = page.viewportSize() ?? { width: 1280, height: 720 };
    await page.locator('.rs-game > canvas').click({ position: { x: size.width / 2, y: size.height / 2 } });
    const dossier = page.getByTestId('council-dossier');
    await expect(dossier).toBeVisible();
    await expect(dossier.getByRole('heading', { name: 'Palace' })).toBeVisible();
    await expect(dossier.getByRole('button', { name: 'Center view' })).toBeEnabled();
    await dossier.getByRole('button', { name: 'Build nearby' }).click();
    await expect(page.getByRole('region', { name: 'Build menu' })).toBeVisible();
  });

  test('minimap is keyboard operable', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000);

    const minimap = page.getByRole('img', { name: /Kingdom minimap/ });
    const before = await labelX(page);
    await minimap.focus();
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(250);

    expect(Math.abs((await labelX(page)) - before)).toBeGreaterThan(5);
  });
});
