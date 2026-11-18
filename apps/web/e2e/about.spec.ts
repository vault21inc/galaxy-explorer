import AxeBuilder from '@axe-core/playwright';
import { getJson } from './api.ts';
import { expect, test, type APIRequestContext, type Page } from './test.ts';

/**
 * Public polish (M8-T9): link previews for chat apps, the attributions and privacy pages, the
 * page that replaces a failed one, and the tab's title. `vite preview` sends link-preview
 * fetchers to the API as Caddy does on the site (ops/caddy/link-previews.caddy).
 */

const SLACK = 'Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)';
const plain = (source: string) => ({ format: 'plain', source, spoiler: false });

async function post(request: APIRequestContext, url: string, data: object) {
  const response = await request.post(url, { data });
  expect(response.ok(), await response.text()).toBe(true);
  return ((await response.json()) as { data: { id: string } }).data;
}

/** The demo's Primus, a hive world with a cover image and a spoiler in its description. */
async function primusId(request: APIRequestContext): Promise<string> {
  const universe = (await getJson(request, '/api/v1/universes/by-slug/example-universe')) as {
    data: { id: string };
  };
  const maps = (await getJson(request, `/api/v1/universes/${universe.data.id}/maps`)) as {
    data: { id: string; slug: string }[];
  };
  const main = maps.data.find((map) => map.slug === 'main');
  if (!main) throw new Error('No demo map.');
  const objects = (await getJson(request, `/api/v1/maps/${main.id}/objects?limit=200`)) as {
    data: { id: string; externalKey: string | null }[];
  };
  const primus = objects.data.find((object) => object.externalKey === 'demo-aster-ii');
  if (!primus) throw new Error('No Primus in the demo.');
  return primus.id;
}

async function noAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .include('main')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(results.violations).toEqual([]);
}

test.describe('public polish (M8-T9)', () => {
  test('a chat app gets a planet’s name, text and image, with no spoilers; a browser gets the app', async ({
    playwright,
    request,
    baseURL,
  }) => {
    const path = `/u/example-universe/main/view/${await primusId(request)}`;
    const chatApp = await playwright.request.newContext({
      ...(baseURL ? { baseURL } : {}),
      extraHTTPHeaders: { 'user-agent': SLACK },
    });
    try {
      const card = await (await chatApp.get(path)).text();
      expect(card).toContain('<meta property="og:title" content="Primus">');
      expect(card).toContain(
        '<meta property="og:description" content="The hive world at the heart of the Inner Reach.">',
      );
      expect(card).toContain(
        '<title>Primus · The Present Era · Example Universe · Galaxy Explorer</title>',
      );
      expect(card).toMatch(
        /<meta property="og:image" content="https?:\/\/[^"]+\/media\/seed\/demo-primus\.webp">/,
      );
      expect(card).not.toContain('secretly loyal');
      expect(card).not.toContain('id="root"');

      // The home page has a card too, with the site's picture, which the web app serves.
      const home = await (await chatApp.get('/')).text();
      expect(home).not.toContain('id="root"');
      const picture = /<meta property="og:image" content="https?:\/\/[^/"]+(\/[^"]+)">/.exec(home);
      expect(picture?.[1]).toBe('/social-card.jpg');
      const served = await request.get('/social-card.jpg');
      expect(served.headers()['content-type']).toBe('image/jpeg');
    } finally {
      await chatApp.dispose();
    }
    // A person's browser (Playwright's own User-Agent) gets the app.
    expect(await (await request.get(path)).text()).toContain('<div id="root"></div>');
  });

  test('the attributions page credits a filled-in page and the demo’s images', async ({ page }) => {
    const slug = `credits-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
    const universe = await post(page.request, '/api/v1/universes', {
      slug,
      name: plain('Credits'),
    });
    const map = await post(page.request, `/api/v1/universes/${universe.id}/maps`, {
      slug: 'main',
      name: plain('Main'),
    });
    const gudrun = await post(page.request, `/api/v1/maps/${map.id}/objects`, {
      name: plain('Gudrun'),
      baseType: 'system',
    });
    await post(page.request, `/api/v1/entities/${gudrun.id}/citations`, {
      target: 'description',
      sourceUrl: 'https://wiki.example.test/wiki/Gudrun',
      sourceTitle: 'Gudrun',
      license: 'CC-BY-SA',
      retrievedAt: '2026-11-14T00:00:57.652Z',
    });

    await page.goto('/');
    await page
      .getByRole('navigation', { name: 'About this site' })
      .getByRole('link', { name: 'Attributions' })
      .click();
    await expect(page).toHaveURL(/\/about\/attributions$/);
    await expect(page).toHaveTitle('Attributions · Galaxy Explorer');
    await expect(
      page.getByText('isn’t affiliated with or endorsed by any rights holder'),
    ).toBeVisible();
    await expect(page.getByRole('link', { name: /game-icons\.net/ })).toBeVisible();

    const credits = page.getByTestId(`attributions-${slug}`);
    await expect(credits.getByRole('link', { name: 'Gudrun' })).toHaveAttribute(
      'href',
      'https://wiki.example.test/wiki/Gudrun',
    );
    await expect(credits).toContainText('wiki.example.test · CC-BY-SA · read');
    await expect(
      page.getByTestId('attributions-example-universe').getByText('Image: Seed placeholder'),
    ).toBeVisible();
    await noAxeViolations(page);
  });

  test('the privacy page lists what the browser keeps', async ({ page }) => {
    await page.goto('/');
    await page
      .getByRole('navigation', { name: 'About this site' })
      .getByRole('link', { name: 'Privacy' })
      .click();
    await expect(page).toHaveTitle('Privacy · Galaxy Explorer');
    const kept = page.getByRole('list', { name: 'What the browser keeps' });
    for (const key of [
      'ge.labels',
      'ge.spoilers',
      'ge.quality',
      'ge.stars',
      'ge.layers',
      'ge.tours',
    ]) {
      await expect(kept.getByText(key)).toBeVisible();
    }
    // There are no accounts here, so nothing about them.
    await expect(page.getByRole('heading', { name: 'What an account stores' })).toHaveCount(0);
    await noAxeViolations(page);
  });

  test('a page whose code fails to load shows the error page, not a stack', async ({ page }) => {
    // As after a release, when the page's file is gone from the server.
    await page.route('**/assets/attributions-page-*.js', (route) => route.abort());
    await page.goto('/');
    await page
      .getByRole('navigation', { name: 'About this site' })
      .getByRole('link', { name: 'Attributions' })
      .click();
    const error = page.getByRole('alert');
    await expect(error.getByRole('heading', { name: 'Something went wrong' })).toBeVisible();
    await expect(error.getByRole('button', { name: 'Retry' })).toBeVisible();
    await expect(error.getByRole('link', { name: 'see all universes' })).toBeVisible();
    // The top bar is still there.
    await expect(page.getByRole('banner')).toBeVisible();
  });

  test('the tab names the map, then the object whose view it is', async ({ page, request }) => {
    await page.goto('/u/example-universe/main');
    await expect(page).toHaveTitle('The Present Era · Example Universe · Galaxy Explorer');
    await page.goto(`/u/example-universe/main/view/${await primusId(request)}`);
    await expect(page).toHaveTitle('Primus · The Present Era · Example Universe · Galaxy Explorer');
    await page.goto('/nowhere');
    await expect(page).toHaveTitle('Page not found · Galaxy Explorer');
  });
});
