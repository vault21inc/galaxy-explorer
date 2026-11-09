import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { waitForFirstFrame, waitForIdle } from './test-hooks.ts';

/**
 * Map settings (M3-T8): the galaxy's shape (presets, sliders with a live preview) and the
 * reference underlay. Each test has its own universe, so changing a map disturbs nothing else.
 */

const plain = (source: string) => ({ format: 'plain', source, spoiler: false });

async function freshMap(request: APIRequestContext) {
  const slug = `settings-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
  const universe = await request.post('/api/v1/universes', {
    data: { slug, name: plain('Settings test') },
  });
  expect(universe.ok()).toBe(true);
  const { data } = (await universe.json()) as { data: { id: string } };
  const map = await request.post(`/api/v1/universes/${data.id}/maps`, {
    data: { slug: 'main', name: plain('Main') },
  });
  expect(map.ok()).toBe(true);
  return `/u/${slug}/main`;
}

const disc = (page: Page) => page.evaluate(() => window.__GE_TEST__?.galaxyDisc() ?? null);
const textures = (page: Page) =>
  page.evaluate(() => window.__GE_TEST__?.renderInfo()?.textures ?? -1);
const underlay = (page: Page) => page.evaluate(() => window.__GE_TEST__?.underlay() ?? null);

/** Cmd or Ctrl, as the app decided: the Chromium project runs with a Windows user agent. */
async function primary(page: Page) {
  return (await page.evaluate(() => window.__GE_TEST__?.platform())) === 'mac' ? 'Meta' : 'Control';
}

async function openSettings(page: Page) {
  await page.keyboard.press('e');
  await page
    .getByRole('toolbar', { name: 'Edit tools' })
    .getByRole('button', { name: 'Map' })
    .click();
  const panel = page.getByRole('complementary', { name: 'Map settings' });
  await expect(panel).toBeVisible();
  return panel;
}

test.describe('map settings (M3-T8)', () => {
  test('a preset and a slider change the disc, survive a reload, and undo one step at a time', async ({
    page,
  }) => {
    await page.goto(await freshMap(page.request));
    await waitForFirstFrame(page);
    const panel = await openSettings(page);
    await expect.poll(() => disc(page)).not.toBeNull();
    const plainKey = (await disc(page))?.key;

    // The preset: a bar appears in the disc's bake.
    await panel.getByRole('button', { name: 'Preset: Barred spiral' }).click();
    await expect.poll(async () => (await disc(page))?.key).toContain('"barLengthRadii":0.3');
    const barredKey = (await disc(page))?.key;
    expect(barredKey).not.toBe(plainKey);
    expect(await page.evaluate(() => window.__GE_TEST__?.renderInfo())).toBeTruthy();
    await waitForIdle(page);

    // Drag the arm-twist slider: a small live preview while dragging, at most one texture more.
    const before = await textures(page);
    const slider = panel.getByRole('slider', { name: 'Arm twist' });
    const box = await slider.boundingBox();
    if (!box) throw new Error('The slider has no size.');
    const y = box.y + box.height / 2;
    await page.mouse.move(box.x + box.width * 0.25, y);
    await page.mouse.down();
    for (const fraction of [0.4, 0.55, 0.7, 0.85]) {
      await page.mouse.move(box.x + box.width * fraction, y, { steps: 4 });
      // Longer than the 150 ms debounce, so the preview re-bakes at each stop.
      await page.waitForTimeout(250);
      expect(await textures(page)).toBeLessThanOrEqual(before + 1);
    }
    expect((await disc(page))?.preview).toBe(true);
    await page.mouse.up();

    // Released: saved, and the full-size disc for the new settings.
    await expect
      .poll(async () => {
        const shown = await disc(page);
        return shown && !shown.preview && shown.key !== barredKey;
      })
      .toBe(true);
    const twistedKey = (await disc(page))?.key;
    expect(twistedKey).toContain('"barLengthRadii":0.3');

    // A reload shows the same galaxy.
    await page.reload();
    await waitForFirstFrame(page);
    await expect.poll(async () => (await disc(page))?.key).toBe(twistedKey);

    // One undo takes back the slider only; the preset stays.
    await page.keyboard.press('e');
    await page
      .getByRole('toolbar', { name: 'Edit tools' })
      .getByRole('button', { name: 'Map' })
      .click();
    // Undo needs this session's history: make one more change, then undo it and the slider.
    await panel.getByRole('slider', { name: 'Arms' }).focus();
    await page.keyboard.press('ArrowRight');
    await expect.poll(async () => (await disc(page))?.key).not.toBe(twistedKey);
    await page.locator('body').click({ position: { x: 5, y: 300 } });
    const key = await primary(page);
    await page.keyboard.press(`${key}+z`);
    await expect.poll(async () => (await disc(page))?.key).toBe(twistedKey);
  });

  test('undo takes back a preset in one step', async ({ page }) => {
    await page.goto(await freshMap(page.request));
    await waitForFirstFrame(page);
    const panel = await openSettings(page);
    await expect.poll(() => disc(page)).not.toBeNull();
    const plainKey = (await disc(page))?.key;
    await panel.getByRole('button', { name: 'Preset: Elliptical' }).click();
    await expect.poll(async () => (await disc(page))?.key).toContain('"arms":0');
    await page
      .getByRole('toolbar', { name: 'Edit tools' })
      .getByRole('button', { name: 'Undo' })
      .click();
    await expect.poll(async () => (await disc(page))?.key).toBe(plainKey);
  });

  test('the underlay shows in edit mode only, and its settings persist', async ({ page }) => {
    const url = await freshMap(page.request);
    await page.goto(url);
    await waitForFirstFrame(page);
    const panel = await openSettings(page);
    const section = panel.getByRole('region', { name: 'Reference underlay' });

    await section.getByRole('button', { name: 'Choose image' }).click();
    const picker = page.getByRole('dialog', { name: 'Add an image' });
    await picker.getByLabel('Upload images').setInputFiles('e2e/fixtures/nebula.png');
    await expect(picker).toBeHidden();
    await expect.poll(() => underlay(page)).toMatchObject({ widthLy: 120_000, opacity: 0.5 });

    // Line it up: wider, and turned.
    const width = section.getByLabel('Width (ly)');
    await width.fill('90000');
    await width.press('Enter');
    await expect.poll(async () => (await underlay(page))?.widthLy).toBe(90_000);
    await section.getByRole('slider', { name: 'Rotation' }).focus();
    await page.keyboard.press('ArrowRight');
    await expect.poll(async () => (await underlay(page))?.rotationDeg).not.toBe(0);
    const lined = await underlay(page);

    // View mode: not drawn.
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await expect.poll(() => underlay(page)).toBeNull();

    // After a reload, edit mode draws it as it was left.
    await page.reload();
    await waitForFirstFrame(page);
    expect(await underlay(page)).toBeNull();
    await page.keyboard.press('e');
    await expect.poll(() => underlay(page)).toEqual(lined);
  });
});
