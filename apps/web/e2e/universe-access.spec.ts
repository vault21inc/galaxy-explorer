import { expect, test } from './test.ts';
import { accountFromInvite, AUTH_URL, signInThrough, uniqueName } from './accounts.ts';

/**
 * Who sees a universe (M8-T11, D-34), against the API with accounts: a new one is private to
 * its owner, "not found" for everyone else, and listed for everyone once it's public.
 */
test.use({ baseURL: AUTH_URL });

test('an account’s new universe is private until it’s made public', async ({ page, browser }) => {
  const owner = await accountFromInvite();
  await signInThrough(page.request, owner);
  await page.goto('/');
  const slug = uniqueName('private');
  await page.getByLabel('Name').fill(slug);
  await page.getByRole('button', { name: 'Create universe' }).click();
  await expect(page).toHaveURL(new RegExp(`/u/${slug}/main`));
  await expect(page.getByRole('button', { name: 'Edit', exact: true })).toBeVisible();

  await page.goto('/');
  const yours = page.getByRole('region', { name: 'Your universes' });
  await expect(yours.getByRole('link', { name: new RegExp(slug) })).toContainText('Private');

  // A browser that isn't signed in: the address is "not found", with an offer to sign in.
  const stranger = await browser.newContext({ baseURL: AUTH_URL });
  const visitor = await stranger.newPage();
  await visitor.goto(`/u/${slug}`);
  await expect(visitor.getByText(`No universe called “${slug}”`)).toBeVisible();
  await expect(visitor.getByRole('link', { name: 'Sign in' }).first()).toBeVisible();
  await visitor.goto('/');
  await expect(visitor.getByRole('link', { name: new RegExp(slug) })).toHaveCount(0);

  // The owner makes it public (the Sharing section is M8-T12's; the API does it here).
  const found = (await (await page.request.get(`/api/v1/universes/by-slug/${slug}`)).json()) as {
    data: { id: string; version: number };
  };
  const patched = await page.request.patch(`/api/v1/universes/${found.data.id}`, {
    headers: { origin: AUTH_URL },
    data: { visibility: 'public', version: found.data.version },
  });
  expect(patched.ok()).toBe(true);

  await visitor.reload();
  const listed = visitor.getByRole('link', { name: new RegExp(slug) });
  await expect(listed).toBeVisible();
  await expect(listed).not.toContainText('Private');
  await visitor.goto(`/u/${slug}/main`);
  await expect(visitor.getByText(`No universe called “${slug}”`)).toHaveCount(0);
  // Reading it isn't editing it.
  await expect(visitor.getByRole('button', { name: 'Edit', exact: true })).toHaveCount(0);
  await stranger.close();
});
