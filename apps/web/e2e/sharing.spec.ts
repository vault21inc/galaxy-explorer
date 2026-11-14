import { expect, test, type APIRequestContext, type Browser, type Page } from './test.ts';
import {
  accountFromInvite,
  AUTH_URL,
  signInThrough,
  uniqueName,
  type Account,
} from './accounts.ts';
import { waitForFirstFrame } from './test-hooks.ts';

/**
 * Sharing a universe (M8-T12, ux.md §13), against the API with accounts, each person in their
 * own browser: the owner shares it from the Sharing section with a viewer and an editor, then
 * makes it link-only and hands the link to someone signed out.
 */
test.use({ baseURL: AUTH_URL });

const editButton = (page: Page) => page.getByRole('button', { name: 'Edit', exact: true });
const plain = (text: string) => ({ format: 'plain', source: text });

/** A universe of the owner's, with a system to enter and a draft that only editors see. */
async function ownUniverse(api: APIRequestContext) {
  const post = async (url: string, data: unknown) => {
    const response = await api.post(url, { headers: { origin: AUTH_URL }, data });
    if (!response.ok())
      throw new Error(`${url}: ${String(response.status())} ${await response.text()}`);
    return ((await response.json()) as { data: Record<string, unknown> }).data;
  };
  const slug = uniqueName('shared');
  const universe = await post('/api/v1/universes', { slug, name: plain(slug) });
  const map = await post(`/api/v1/universes/${universe.id as string}/maps`, {
    slug: 'main',
    name: plain('Main'),
  });
  const mapId = map.id as string;
  const aster = await post(`/api/v1/maps/${mapId}/objects`, {
    name: plain('Aster'),
    baseType: 'system',
    explorable: true,
  });
  const hidden = await post(`/api/v1/maps/${mapId}/objects`, {
    name: plain('Hidden'),
    baseType: 'system',
    x: 40,
    status: 'draft',
  });
  return {
    slug,
    universeId: universe.id as string,
    asterId: aster.id as string,
    hiddenId: hidden.id as string,
  };
}

/** A browser of its own, signed in as `account` (or signed out). */
async function browserOf(browser: Browser, account?: Account) {
  const context = await browser.newContext({ baseURL: AUTH_URL });
  if (account) await signInThrough(context.request, account);
  return { context, page: await context.newPage() };
}

/** Whether the galaxy view draws an object, through the test hooks. */
function draws(page: Page, id: string): Promise<boolean> {
  return page.evaluate((target) => window.__GE_TEST__?.drawnObject(target) != null, id);
}

test('the owner shares with a viewer, an editor and a link', async ({ page, browser }) => {
  const [owner, viewer, editor] = await Promise.all([
    accountFromInvite(),
    accountFromInvite(),
    accountFromInvite(),
  ]);
  await signInThrough(page.request, owner);
  const u = await ownUniverse(page.request);

  // The owner adds both from the Sharing section, by exact username.
  await page.goto(`/u/${u.slug}/settings`);
  const sharing = page.getByRole('region', { name: 'Sharing' });
  const add = sharing.getByRole('form', { name: 'Add a person' });
  await add.getByLabel('Username').fill('nobody-at-all');
  await add.getByRole('button', { name: 'Add' }).click();
  await expect(sharing.getByRole('alert')).toContainText('No account is called “nobody-at-all”');
  await add.getByLabel('Username').fill(viewer.username);
  await add.getByRole('button', { name: 'Add' }).click();
  await expect(sharing.getByRole('listitem').filter({ hasText: viewer.username })).toBeVisible();
  await add.getByLabel('Username').fill(editor.username);
  await add.getByLabel('Role').selectOption('editor');
  await add.getByRole('button', { name: 'Add' }).click();
  await expect(sharing.getByLabel(`Role of ${editor.username}`)).toHaveValue('editor');
  await expect(sharing.getByLabel(`Role of ${viewer.username}`)).toHaveValue('viewer');

  // The viewer reads it, with no edit toggle, and doesn't see the draft.
  const asViewer = await browserOf(browser, viewer);
  await asViewer.page.goto(`/u/${u.slug}/main`);
  await waitForFirstFrame(asViewer.page);
  await expect.poll(() => draws(asViewer.page, u.asterId)).toBe(true);
  expect(await draws(asViewer.page, u.hiddenId)).toBe(false);
  await expect(editButton(asViewer.page)).toHaveCount(0);
  await asViewer.context.close();

  // The editor changes it, and History says who did.
  const asEditor = await browserOf(browser, editor);
  const editorPage = asEditor.page;
  await editorPage.goto(`/u/${u.slug}/main?select=${u.asterId}`);
  await waitForFirstFrame(editorPage);
  await editorPage.keyboard.press('e');
  const details = editorPage.getByRole('complementary', { name: 'Details' });
  const name = details.getByLabel('Name', { exact: true });
  await name.fill('Aster Prime');
  await name.press('Enter');
  await expect
    .poll(() => editorPage.evaluate((id) => window.__GE_TEST__?.drawnObject(id)?.label, u.asterId))
    .toBe('Aster Prime');
  // Editors see the draft, in edit mode.
  await expect.poll(() => draws(editorPage, u.hiddenId)).toBe(true);
  await editorPage
    .getByRole('toolbar', { name: 'Edit tools' })
    .getByRole('button', { name: 'History' })
    .click();
  const history = editorPage.getByRole('complementary', { name: 'History' });
  await expect(history.getByText(editor.username).first()).toBeVisible();
  // The Sharing section is read-only for an editor.
  await editorPage.goto(`/u/${u.slug}/settings`);
  const editorSharing = editorPage.getByRole('region', { name: 'Sharing' });
  await expect(editorSharing.getByRole('button', { name: 'Leave this universe' })).toBeVisible();
  await expect(editorSharing.getByRole('radio')).toHaveCount(0);
  await expect(editorSharing.getByRole('form', { name: 'Add a person' })).toHaveCount(0);
  await asEditor.context.close();

  // Link-only: the owner copies the link out of the section.
  await page.getByRole('radio', { name: /Anyone with the link/ }).check();
  const linkField = sharing.getByLabel('The link', { exact: true });
  await expect(linkField).toHaveValue(/\?k=/);
  const link = new URL(await linkField.inputValue());
  const key = link.searchParams.get('k') ?? '';

  // Someone signed out opens it, and the key stays in the address into a system.
  const visitor = await browserOf(browser);
  const visitorPage = visitor.page;
  await visitorPage.goto(`${link.pathname}${link.search}`);
  await expect(visitorPage).toHaveURL(new RegExp(`/u/${u.slug}/main\\?k=${key}`));
  await waitForFirstFrame(visitorPage);
  await expect.poll(() => draws(visitorPage, u.asterId)).toBe(true);
  await expect(editButton(visitorPage)).toHaveCount(0);
  await visitorPage.evaluate((id) => window.__GE_TEST__?.enter(id), u.asterId);
  await expect
    .poll(() => visitorPage.evaluate(() => window.__GE_TEST__?.level()?.level))
    .toBe('system');
  await expect(visitorPage).toHaveURL(new RegExp(`/view/${u.asterId}\\?k=${key}`));

  // A new link: the old one is "not found", even with its cookie.
  await sharing.getByRole('button', { name: 'Make a new link' }).click();
  await expect(linkField).not.toHaveValue(link.toString());
  await visitorPage.reload();
  await expect(visitorPage.getByText(`No universe called “${u.slug}”`)).toBeVisible();
  await visitor.context.close();
});
