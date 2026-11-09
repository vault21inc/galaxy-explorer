import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { waitForFirstFrame } from './test-hooks.ts';

/**
 * The generated edit form and the rich-text editor (M3-T4), each test on a fresh universe
 * with one system, so edits never disturb the demo maps other tests count on.
 */

const plain = (source: string) => ({ format: 'plain', source, spoiler: false });

async function setUp(request: APIRequestContext) {
  const slug = `form-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
  const universe = (
    (await (
      await request.post('/api/v1/universes', { data: { slug, name: plain('Form test') } })
    ).json()) as { data: { id: string } }
  ).data;
  const map = (
    (await (
      await request.post(`/api/v1/universes/${universe.id}/maps`, {
        data: { slug: 'main', name: plain('Main') },
      })
    ).json()) as { data: { id: string } }
  ).data;
  const object = (
    (await (
      await request.post(`/api/v1/maps/${map.id}/objects`, {
        data: { name: plain('Alpha'), baseType: 'system', x: 0, y: 0, z: 0 },
      })
    ).json()) as { data: { id: string } }
  ).data;
  return { url: `/u/${slug}/main?select=${object.id}`, universeId: universe.id, id: object.id };
}

async function objectOf(request: APIRequestContext, id: string) {
  return (
    (await (await request.get(`/api/v1/objects/${id}`)).json()) as {
      data: {
        version: number;
        namePlain: string;
        summary: { format: string; source: string } | null;
        description: { format: string; source: string } | null;
      };
    }
  ).data;
}

async function batches(request: APIRequestContext, universeId: string) {
  const history = (await (await request.get(`/api/v1/universes/${universeId}/history`)).json()) as {
    data: { description: string }[];
  };
  return history.data.map((batch) => batch.description);
}

/** Opens the map with the object selected, in edit mode. */
async function openForm(page: Page, url: string) {
  await page.goto(url);
  await waitForFirstFrame(page);
  await page.keyboard.press('e');
  const panel = page.getByRole('complementary', { name: 'Details' });
  await expect(panel.getByRole('form', { name: 'Edit Alpha' })).toBeVisible();
  return panel;
}

/** Leaves edit mode with the toolbar button, which also takes focus from the field (a blur). */
async function leaveEditMode(page: Page) {
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
}

test.describe('the edit form (M3-T4)', () => {
  test('renaming an object updates its label, as one batch', async ({ page }) => {
    const s = await setUp(page.request);
    const panel = await openForm(page, s.url);
    const name = panel.getByLabel('Name', { exact: true });
    await name.fill('Nova Prime');
    await name.press('Enter');
    await expect
      .poll(() => page.evaluate((id) => window.__GE_TEST__?.drawnObject(id)?.label, s.id))
      .toBe('Nova Prime');
    expect((await batches(page.request, s.universeId))[0]).toBe('Rename “Alpha” to “Nova Prime”');
  });

  test('a Markdown description renders formatted in view mode', async ({ page }) => {
    const s = await setUp(page.request);
    const panel = await openForm(page, s.url);
    const description = panel.getByRole('group', { name: 'Description field' });
    // Empty descriptions start as Markdown, in CodeMirror.
    await expect(description.locator('[data-code-editor="markdown"]')).toBeVisible();
    await description.getByRole('textbox', { name: 'Description' }).click();
    await page.keyboard.type('A **forge** world.');
    await leaveEditMode(page);
    await expect
      .poll(async () => (await objectOf(page.request, s.id)).description?.source)
      .toBe('A **forge** world.');
    await expect(panel.locator('.rich-text strong')).toHaveText('forge');
  });

  test('marking a phrase as a spoiler blacks it out in view mode', async ({ page }) => {
    const s = await setUp(page.request);
    const panel = await openForm(page, s.url);
    const description = panel.getByRole('group', { name: 'Description field' });
    const editor = description.getByRole('textbox', { name: 'Description' });
    await editor.click();
    await page.keyboard.type('A forge world. It burns.');
    // Select "It burns." from the end, one character at a time.
    for (const key of Array<string>('It burns.'.length).fill('Shift+ArrowLeft')) {
      await page.keyboard.press(key);
    }
    await description.getByRole('button', { name: 'Mark as spoiler in Description' }).click();
    await expect(editor).toHaveText('A forge world. ||It burns.||');

    await leaveEditMode(page);
    await expect
      .poll(async () => (await objectOf(page.request, s.id)).description?.source)
      .toBe('A forge world. ||It burns.||');
    // Spoilers are hidden by default: the phrase is a bar, the rest is text.
    await expect(panel).toContainText('A forge world.');
    await expect(panel).not.toContainText('It burns');
    await expect(panel.locator(`[data-spoiler-key="${s.id}/description#0"]`)).toBeVisible();
  });

  test('each format gets its editor, and the server says what HTML it removed', async ({
    page,
  }) => {
    const s = await setUp(page.request);
    const panel = await openForm(page, s.url);
    const summary = panel.getByRole('group', { name: 'Summary field' });
    const format = summary.getByLabel('Summary format');

    await format.selectOption('plain');
    await expect(summary.locator('textarea')).toBeVisible();
    await format.selectOption('html');
    await expect(summary.locator('[data-code-editor="html"]')).toBeVisible();

    await summary.getByRole('textbox', { name: 'Summary' }).click();
    // insertText, not typing: the HTML editor closes tags as they're typed.
    await page.keyboard.insertText('<p onclick="steal()">Hi</p><script>bad()</script>');
    await page.keyboard.press('Tab');
    // The notice sits under the field.
    await expect(panel.getByRole('status').filter({ hasText: 'removed on save' })).toHaveText(
      'Not allowed, so removed on save: onclick on <p>, <script>.',
    );
    expect((await objectOf(page.request, s.id)).summary).toMatchObject({
      format: 'html',
      source: '<p>Hi</p>',
    });
  });

  test('a conflict offers reload or overwrite', async ({ page }) => {
    const s = await setUp(page.request);
    const panel = await openForm(page, s.url);
    const name = panel.getByLabel('Name', { exact: true });

    // Someone else renames it after the form has read version 1.
    const rename = async (source: string, version: number) =>
      page.request.patch(`/api/v1/objects/${s.id}`, { data: { version, name: plain(source) } });
    expect((await rename('Elsewhere', 1)).ok()).toBe(true);

    await name.fill('Mine');
    await name.press('Enter');
    const dialog = page.getByRole('dialog', { name: 'Changed elsewhere' });
    await expect(dialog).toContainText('Elsewhere');
    await expect(dialog).toContainText('Mine');
    await dialog.getByRole('button', { name: 'Overwrite' }).click();
    await expect.poll(async () => (await objectOf(page.request, s.id)).namePlain).toBe('Mine');
    await expect(name).toHaveValue('Mine');

    // Again, and this time keep theirs.
    const { version } = await objectOf(page.request, s.id);
    expect((await rename('Theirs', version)).ok()).toBe(true);
    await name.fill('Mine again');
    await name.press('Enter');
    await dialog.getByRole('button', { name: 'Reload' }).click();
    await expect(dialog).toBeHidden();
    await expect(name).toHaveValue('Theirs');
    expect((await objectOf(page.request, s.id)).namePlain).toBe('Theirs');
  });
});
