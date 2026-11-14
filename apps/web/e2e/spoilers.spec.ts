import { expect, test, type Page } from './test.ts';
import { galaxyObjects } from './demo.ts';
import { waitForFirstFrame } from './test-hooks.ts';

const MAP = '/u/example-universe/main';

/** Opens the demo map with one object selected, by its name. */
async function openWith(page: Page, name: string) {
  const objects = await galaxyObjects(page.request, 'example-universe', 'main');
  const object = objects.find((item) => item.namePlain === name);
  if (!object) throw new Error(`No ${name} in the demo.`);
  await page.goto(`${MAP}?select=${object.id}`);
  await waitForFirstFrame(page);
  const panel = page.getByRole('complementary', { name: 'Details' });
  await expect(panel).toBeVisible();
  return { object, panel };
}

test.describe('spoilers (ux.md §6)', () => {
  test('are hidden by default, and a click reveals only that item', async ({ page }) => {
    // The Maw: its whole name is a spoiler, and its HTML description hides one sentence.
    const { object, panel } = await openWith(page, 'The Maw');
    await expect(panel).toContainText('A storm in the void.');
    await expect(panel).not.toContainText('The Maw');
    await expect(panel).not.toContainText('It swallowed the Erebus fleet.');
    await expect(page.getByRole('button', { name: 'Spoilers: Hidden' })).toBeVisible();

    await panel.locator(`[data-spoiler-key="${object.id}/description#0"]`).click();
    await expect(panel).toContainText('It swallowed the Erebus fleet.');
    // Only that item: the name is still hidden.
    await expect(panel).not.toContainText('The Maw');
    await expect(panel.locator(`[data-spoiler-key="${object.id}/name"]`)).toBeVisible();
  });

  test('a whole hidden entity shows a notice and a Reveal button', async ({ page }) => {
    const { panel } = await openWith(page, 'Erebus');
    await expect(panel).toContainText('This entry contains potential spoilers.');
    await expect(panel).not.toContainText('Erebus');
    await panel.getByRole('button', { name: 'Reveal' }).click();
    await expect(panel).toContainText('Erebus');
    await expect(panel).toContainText('Where the Outer Reach fell silent.');
  });

  test('the toggle reveals everything, and a reload keeps it', async ({ page }) => {
    const { panel } = await openWith(page, 'The Maw');
    await page.getByRole('button', { name: 'Spoilers: Hidden' }).click();
    await expect(panel).toContainText('The Maw');
    await expect(panel).toContainText('It swallowed the Erebus fleet.');
    await expect(
      panel.getByRole('img', { name: 'Flagged as a potential spoiler' }).first(),
    ).toBeVisible();
    // The spoiler map's name shows in the switcher too.
    await page.getByRole('button', { name: /^Map:/ }).click();
    await expect(page.getByRole('menuitemradio', { name: 'After the Fall' })).toBeVisible();
    await page.keyboard.press('Escape');

    await page.reload();
    await waitForFirstFrame(page);
    await expect(page.getByRole('button', { name: 'Spoilers: Shown' })).toBeVisible();
    await expect(page.getByRole('complementary', { name: 'Details' })).toContainText('The Maw');

    // Shift + S switches back.
    await page.keyboard.press('Shift+S');
    await expect(page.getByRole('button', { name: 'Spoilers: Hidden' })).toBeVisible();
  });

  test('hidden maps keep their names out of the switcher', async ({ page }) => {
    await page.goto(MAP);
    await waitForFirstFrame(page);
    await page.getByRole('button', { name: /^Map:/ }).click();
    const items = page.getByRole('menuitemradio');
    await expect(items).toHaveCount(2);
    await expect(items.nth(1)).toHaveText(/^▇+$/);
  });

  test('hostile HTML in the seed renders inert', async ({ page }) => {
    const dialogs: string[] = [];
    page.on('dialog', (dialog) => {
      dialogs.push(dialog.message());
      void dialog.dismiss();
    });
    const { panel } = await openWith(page, 'Brennan');
    await expect(panel).toContainText('A trade hub on the Reach.');
    await expect(panel).toContainText('Old charts');
    // Nothing executable made it into the panel.
    const dangerous = await panel.evaluate((element) => ({
      scripts: element.querySelectorAll('script, iframe').length,
      handlers: [...element.querySelectorAll('*')].filter((node) =>
        [...node.attributes].some((attribute) => attribute.name.startsWith('on')),
      ).length,
      jsLinks: element.querySelectorAll('a[href^="javascript"]').length,
    }));
    expect(dangerous).toEqual({ scripts: 0, handlers: 0, jsLinks: 0 });
    // Reveal the spoiler span that carried an onclick, and click its text.
    await page.getByRole('button', { name: 'Spoilers: Hidden' }).click();
    await panel.getByText('Smugglers run it.').click();
    await page.waitForTimeout(300);
    expect(dialogs).toEqual([]);
  });
});
