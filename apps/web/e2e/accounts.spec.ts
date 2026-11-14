import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from './test.ts';
import { accountFromInvite, AUTH_URL, inviteLink, nextCode, totp, uniqueName } from './accounts.ts';
import { waitForFirstFrame } from './test-hooks.ts';

/**
 * Accounts and signing in (M8-T1, ux.md §13), against the API with GE_AUTH_MODE=required.
 * Every test makes its own accounts through `pnpm admin:invite`, so the browsers don't share any.
 */
test.use({ baseURL: AUTH_URL });

const MAP = '/u/example-universe/main';
const editButton = (page: Page) => page.getByRole('button', { name: 'Edit', exact: true });
const axeTags = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

test.describe('accounts (M8-T1)', () => {
  test('the admin signs in and edits; signed out, the edit toggle is gone', async ({ page }) => {
    const admin = await accountFromInvite({ admin: true });
    await page.goto(MAP);
    await waitForFirstFrame(page);
    // Signed out: reading only.
    await expect(page.getByRole('link', { name: 'Sign in' })).toBeVisible();
    await expect(editButton(page)).toHaveCount(0);

    await page.getByRole('link', { name: 'Sign in' }).click();
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
    expect((await new AxeBuilder({ page }).withTags(axeTags).analyze()).violations).toEqual([]);

    // A wrong code says only that it didn't work.
    await page.getByLabel('Username').fill(admin.username);
    await page.getByLabel('Password').fill(admin.password);
    await page.getByLabel('Code from your authenticator app').fill('000000');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('alert')).toContainText('That didn’t work');

    // The first code was used up making the account: the next one.
    await page.getByLabel('Code from your authenticator app').fill(await nextCode(admin));
    await page.getByRole('button', { name: 'Sign in' }).click();
    // Back where they were, now able to edit.
    await expect(page).toHaveURL(new RegExp(`${MAP}$`));
    await expect(page.getByRole('button', { name: `Account: ${admin.username}` })).toBeVisible();
    await expect(editButton(page)).toBeVisible();
    await page.keyboard.press('e');
    await expect(page.getByRole('toolbar', { name: 'Edit tools' })).toBeVisible();

    // An edit, through the app: a new universe from the home page.
    await page.goto('/');
    const slug = uniqueName('mine');
    await page.getByLabel('Name').fill(slug);
    await page.getByRole('button', { name: 'Create universe' }).click();
    await expect(page).toHaveURL(new RegExp(`/u/${slug}/`));
    await expect(editButton(page)).toBeVisible();
    // History records the account.
    const universes = (await (await page.request.get('/api/v1/universes')).json()) as {
      data: { id: string; slug: string }[];
    };
    const mine = universes.data.find((universe) => universe.slug === slug);
    const history = (await (
      await page.request.get(`/api/v1/universes/${mine?.id ?? ''}/history`)
    ).json()) as { data: { actorLabel: string }[] };
    expect(history.data.map((batch) => batch.actorLabel)).toContain(admin.username);

    await page.getByRole('button', { name: `Account: ${admin.username}` }).click();
    await page.getByRole('menuitem', { name: 'Sign out' }).click();
    await expect(page.getByRole('banner').getByRole('link', { name: 'Sign in' })).toBeVisible();
    await expect(editButton(page)).toHaveCount(0);
    // The new universe is private (M8-T11): signed out, it's "not found".
    await expect(page.getByText(`No universe called “${slug}”`)).toBeVisible();
  });

  test('an invite link leads through username, password and codes to a signed-in account', async ({
    page,
  }) => {
    const link = inviteLink();
    await page.goto(link);
    await expect(page.getByRole('heading', { name: 'Make your account' })).toBeVisible();
    const username = uniqueName('invited');
    const password = 'my own long password';
    await page.getByLabel('Username').fill(username);
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByLabel('The same password again').fill(password);
    await expect(page.getByRole('listitem').filter({ hasText: '(not yet)' })).toHaveCount(0);
    expect((await new AxeBuilder({ page }).withTags(axeTags).analyze()).violations).toEqual([]);
    await page.getByRole('button', { name: 'Next: two-factor codes' }).click();

    await expect(page.getByText('Step 2 of 2')).toBeVisible();
    await expect(page.getByRole('img', { name: /QR code/ })).toBeVisible();
    const secret = (await page.getByTestId('totp-secret').textContent()) ?? '';
    expect((await new AxeBuilder({ page }).withTags(axeTags).analyze()).violations).toEqual([]);
    await page.getByLabel('A code from the app').fill(totp(secret));
    await page.getByRole('button', { name: 'Finish' }).click();

    // Signed in, on the home page, and able to start a universe.
    await expect(page).toHaveURL(`${AUTH_URL}/`);
    await expect(page.getByRole('button', { name: `Account: ${username}` })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Create universe' })).toBeVisible();

    // The link worked once.
    await page.goto(link);
    await expect(page.getByRole('heading', { name: 'This link was used' })).toBeVisible();
  });
});
