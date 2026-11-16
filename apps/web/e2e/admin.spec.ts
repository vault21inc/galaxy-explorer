import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from './test.ts';
import { accountFromInvite, AUTH_URL, nextCode, signInThrough, uniqueName } from './accounts.ts';

/**
 * The account page and the admin screens (M8-T13, ux.md §13), against the API with accounts:
 * the admin invites an account from the Accounts screen, sees its private universe in Universes
 * and on the home page, opens it to edit (D-50), and disables the account, which signs it out.
 */
test.use({ baseURL: AUTH_URL });

const axeTags = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const noViolations = async (page: Page) => {
  expect((await new AxeBuilder({ page }).withTags(axeTags).analyze()).violations).toEqual([]);
};

test('an admin invites an account, opens its private universe to edit, and disables it', async ({
  page,
  browser,
}) => {
  // Two codes for the admin, signing in and then disabling: the second may wait for the clock.
  test.slow();
  const admin = await accountFromInvite({ admin: true });
  await signInThrough(page.request, admin);

  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: 'Admin' })).toBeVisible();
  await noViolations(page);
  await page.getByRole('button', { name: 'Invite someone' }).click();
  await page.getByRole('button', { name: 'Make the link' }).click();
  const link = (await page.getByTestId('link-once').textContent()) ?? '';
  expect(link).toMatch(new RegExp(`^${AUTH_URL}/link/`));
  await page.getByRole('button', { name: 'Done' }).click();

  // The invitee, in a browser of their own, signs up and starts a private universe.
  const theirs = await browser.newContext({ baseURL: AUTH_URL });
  const invitee = await theirs.newPage();
  await invitee.goto(new URL(link).pathname);
  const username = uniqueName('invitee');
  const password = 'the invitee’s long password';
  await invitee.getByLabel('Username').fill(username);
  await invitee.getByLabel('Password', { exact: true }).fill(password);
  await invitee.getByLabel('The same password again').fill(password);
  // Without two-factor codes (D-47): the account is made at once.
  await invitee.getByRole('button', { name: 'Make the account' }).click();
  await expect(invitee.getByRole('button', { name: `Account: ${username}` })).toBeVisible();
  const slug = uniqueName('theirs');
  await invitee.getByLabel('Name').fill(slug);
  await invitee.getByRole('button', { name: 'Create universe' }).click();
  await expect(invitee).toHaveURL(new RegExp(`/u/${slug}/main`));

  // The admin sees it in Universes, as facts about it.
  await page.reload();
  await page.getByRole('tab', { name: 'Universes' }).click();
  const row = page.getByRole('row').filter({ hasText: `/u/${slug}` });
  await expect(row).toContainText(username);
  await expect(row).toContainText('Private');
  await noViolations(page);
  await page.getByRole('tab', { name: 'Log' }).click();
  await expect(page.getByRole('cell', { name: 'made an invite' }).first()).toBeVisible();
  await noViolations(page);
  // And opens it from there, to edit as an editor would (D-50).
  await page.getByRole('tab', { name: 'Universes' }).click();
  await row.getByRole('link', { name: `Open: ${slug}` }).click();
  await expect(page).toHaveURL(new RegExp(`/u/${slug}/main`));
  await expect(page.getByRole('button', { name: 'Edit', exact: true })).toBeVisible();
  // On the home page it's listed apart, not as shared with the admin.
  await page.goto('/');
  const others = page.getByRole('region', { name: 'Other accounts’ universes' });
  await expect(others.getByRole('link', { name: new RegExp(slug) })).toBeVisible();
  // (Shared with you holds the installation's own universes, which an admin owns.)
  await expect(
    page
      .getByRole('region', { name: 'Shared with you' })
      .getByRole('link', { name: new RegExp(slug) }),
  ).toHaveCount(0);

  // Disabling it, with a code, signs the invitee out at their next request.
  await page.goto('/admin');
  await page.getByRole('button', { name: `Disable: ${username}` }).click();
  await page.getByLabel('Code from your authenticator app').fill(await nextCode(admin));
  await page.getByRole('dialog').getByRole('button', { name: 'Disable' }).click();
  const inviteeRow = page.getByRole('row').filter({ hasText: username });
  await expect(inviteeRow).toContainText('Disabled');
  // The Accounts table says who has two-factor codes on: not the invitee.
  await expect(inviteeRow.getByRole('cell').nth(2)).toHaveText('Off');

  await invitee.reload();
  await expect(invitee.getByRole('banner').getByRole('link', { name: 'Sign in' })).toBeVisible();
  await expect(invitee.getByText(`No universe called “${slug}”`)).toBeVisible();
  await theirs.close();
});

test('the account page shows the devices and the storage, and is accessible', async ({ page }) => {
  const account = await accountFromInvite();
  await signInThrough(page.request, account);
  await page.goto('/');
  await page.getByRole('button', { name: `Account: ${account.username}` }).click();
  await page.getByRole('menuitem', { name: 'Account' }).click();
  await expect(page).toHaveURL(`${AUTH_URL}/account`);
  await expect(page.getByRole('heading', { name: 'Signed-in devices' })).toBeVisible();
  await expect(page.getByText('(this one)')).toBeVisible();
  await expect(page.getByText(/of 2\.0 GB used/)).toBeVisible();
  await noViolations(page);
  // Not an admin: no Admin item, and /admin is "not found".
  await page.getByRole('button', { name: `Account: ${account.username}` }).click();
  await expect(page.getByRole('menuitem', { name: 'Admin' })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await page.goto('/admin');
  await expect(page.getByText('Page not found')).toBeVisible();
});
