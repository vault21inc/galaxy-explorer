import { HTML_XSS_CORPUS, MARKDOWN_XSS_CORPUS, PLAIN_XSS_CORPUS } from '@ge/domain/testing';
import { expect, test, type APIRequestContext, type Page } from './test.ts';
import { waitForFirstFrame, waitForIdle } from './test-hooks.ts';

/**
 * The XSS corpus on rendered pages (M8-T3): every payload of @ge/domain/testing, in all three
 * rich-text formats, planted through the API as any client could, then shown wherever the app
 * shows text: the universe list, the details panel with spoilers revealed, the outliner,
 * search and History. Nothing may run (no `alert` dialog), nothing that could run may reach
 * the page (no event-handler attributes, no javascript: or data: URLs), and the page may not
 * even try: the CSP guard in ./test.ts fails the test on any violation the browser reports.
 */

type Format = 'plain' | 'markdown' | 'html';
const text = (format: Format, source: string) => ({ format, source, spoiler: false });
const all = (corpus: readonly (readonly [string, string])[], separator: string) =>
  corpus.map(([, payload]) => payload).join(separator);

async function post(request: APIRequestContext, url: string, data: object) {
  const response = await request.post(url, { data });
  expect(response.ok(), await response.text()).toBe(true);
  return ((await response.json()) as { data: { id: string } }).data;
}

/** A universe whose names, summaries and descriptions are all payloads. */
async function plant(request: APIRequestContext) {
  const slug = `xss-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
  const universe = await post(request, '/api/v1/universes', {
    slug,
    name: text('plain', `Hostile ${slug} ${all(PLAIN_XSS_CORPUS, ' ')}`),
  });
  const map = await post(request, `/api/v1/universes/${universe.id}/maps`, {
    slug: 'main',
    name: text('plain', 'Main'),
  });
  const object = (x: number, format: Format, name: string, payloads: string) =>
    post(request, `/api/v1/maps/${map.id}/objects`, {
      name: text(format, name),
      baseType: 'system',
      summary: text(format, payloads),
      description: text(format, payloads),
      x,
    });
  // Each name starts with a plain word, which search and the checks below look for.
  const html = await object(
    -4_000,
    'html',
    'Htmlworld <b onclick="alert(1)">bold</b><img src=x onerror=alert(1)>',
    all(HTML_XSS_CORPUS, '\n'),
  );
  const markdown = await object(
    0,
    'markdown',
    'Markworld [x](javascript:alert(1))',
    all(MARKDOWN_XSS_CORPUS, '\n\n'),
  );
  const plain = await object(
    4_000,
    'plain',
    `Plainworld ${all(PLAIN_XSS_CORPUS, ' ')}`,
    all(PLAIN_XSS_CORPUS, '\n'),
  );
  return { slug, ids: [html.id, markdown.id, plain.id] };
}

/** Nothing in the page that could run: handlers, script URLs, foreign frames or images. */
async function expectInert(page: Page) {
  const dangerous = await page.evaluate(() => {
    const found: string[] = [];
    for (const element of document.querySelectorAll('*')) {
      for (const attribute of element.attributes) {
        const value = attribute.value.trim().toLowerCase().replace(/\s+/g, '');
        if (attribute.name.startsWith('on')) found.push(`${element.tagName} ${attribute.name}`);
        if (
          ['href', 'src', 'srcset', 'action', 'formaction', 'xlink:href'].includes(
            attribute.name,
          ) &&
          /^(javascript|vbscript|data:text)/.test(value)
        ) {
          found.push(`${element.tagName} ${attribute.name}=${attribute.value}`);
        }
      }
    }
    for (const element of document.querySelectorAll('iframe, object, embed, base, form[action]')) {
      found.push(element.tagName);
    }
    // The app's own scripts are files; a payload's would be inline.
    for (const script of document.querySelectorAll('script:not([src])')) {
      found.push(`inline script: ${script.textContent.slice(0, 40)}`);
    }
    return found;
  });
  expect(dangerous).toEqual([]);
}

test('the XSS corpus, planted through the API, renders inert everywhere it shows', async ({
  page,
}) => {
  const dialogs: string[] = [];
  page.on('dialog', (dialog) => {
    dialogs.push(dialog.message());
    void dialog.dismiss();
  });
  const { slug, ids } = await plant(page.request);

  // The universe list, with the universe's name.
  await page.goto('/');
  await expect(page.getByText(`Hostile ${slug} `).first()).toBeVisible();
  await expectInert(page);

  // Each object's details, spoilers revealed so that everything renders.
  await page.goto(`/u/${slug}/main`);
  await waitForFirstFrame(page);
  await page.getByRole('button', { name: 'Spoilers: Hidden' }).click();
  const panel = page.getByRole('complementary', { name: 'Details' });
  for (const [id, word] of [
    [ids[0], 'Htmlworld'],
    [ids[1], 'Markworld'],
    [ids[2], 'Plainworld'],
  ] as const) {
    await page.goto(`/u/${slug}/main?select=${String(id)}`);
    await waitForFirstFrame(page);
    await expect(panel).toContainText(word);
    await waitForIdle(page, 300);
    await expectInert(page);
  }
  // Plain text shows the payload as text: proof that it reached the page, and stayed text.
  await expect(panel).toContainText('<script>alert(1)</script>');

  // The outliner lists every name.
  await page.getByRole('button', { name: 'List' }).click();
  const outliner = page.getByRole('complementary', { name: 'Outliner' });
  await expect(outliner.getByText(/^Markworld/)).toBeVisible();
  await expectInert(page);

  // Search shows names and summaries as results: each object's, by its name's first word.
  const primary =
    (await page.evaluate(() => window.__GE_TEST__?.platform())) === 'mac' ? 'Meta' : 'Control';
  await page.keyboard.press(`${primary}+k`);
  const input = page.getByRole('combobox', { name: 'Search or run a command' });
  const results = page.getByRole('listbox', { name: 'Results and commands' });
  for (const word of ['htmlworld', 'markworld', 'plainworld']) {
    await input.fill(word);
    await expect(results.getByRole('option').first()).toContainText(new RegExp(word, 'i'));
    await expectInert(page);
  }
  await page.keyboard.press('Escape');

  // History lists the changes (made through the API, they're named by their kind).
  await page.keyboard.press('e');
  await page
    .getByRole('toolbar', { name: 'Edit tools' })
    .getByRole('button', { name: 'History' })
    .click();
  const history = page.getByRole('complementary', { name: 'History' });
  await expect(history.getByText('Create object').first()).toBeVisible();
  await expectInert(page);

  expect(dialogs).toEqual([]);
});
