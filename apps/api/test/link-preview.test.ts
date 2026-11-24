import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { LINK_PREVIEW_SNIPPET_PATH, linkPreviewSnippet } from '../src/http/link-preview-caddy.ts';
import { linkPreviewPage } from '../src/routes/link-preview-page.ts';

/** Link previews (M8-T9): the Caddy routing and the page of tags. */

describe('link previews', () => {
  it('are routed as the committed Caddy snippet says (`pnpm headers:caddy` writes it)', async () => {
    const path = `../../../${LINK_PREVIEW_SNIPPET_PATH}`;
    const committed = await readFile(new URL(path, import.meta.url));
    expect(committed.toString(), 'Run `pnpm headers:caddy` and commit the result.').toBe(
      linkPreviewSnippet(),
    );
  });

  it('write text and addresses into the page escaped', () => {
    const html = linkPreviewPage({
      title: 'A "quoted" <b>name</b> · Galaxy Explorer',
      heading: 'A "quoted" <b>name</b>',
      description: 'Tom & Jerry’s <script>alert(1)</script>',
      url: 'https://galaxy.test/u/a?select=x"><script>',
      image: null,
      noIndex: true,
      body: ['A <p>aragraph</p>'],
      crumbs: [{ name: 'Home & away', url: 'https://galaxy.test/' }],
      links: {
        heading: '<Maps>',
        items: [{ name: 'M<41>', url: 'https://galaxy.test/u/a/m41', text: '</script><script>' }],
      },
      found: true,
    });
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<p>aragraph');
    expect(html).toContain('<nav><a href="https://galaxy.test/">Home &amp; away</a></nav>');
    expect(html).toContain('<h2>&lt;Maps&gt;</h2>');
    expect(html).toContain('M&lt;41&gt;</a> — &lt;/script&gt;');
    expect(html).not.toContain('<b>');
    expect(html).toContain('content="A &quot;quoted&quot; &lt;b&gt;name&lt;/b&gt;"');
    expect(html).toContain('Tom &amp; Jerry’s &lt;script&gt;');
    expect(html).toContain('<meta name="robots" content="noindex">');
    expect(html).not.toContain('og:image');
  });

  it('describe the page as JSON-LD that no text can break out of', () => {
    const html = linkPreviewPage({
      title: 'Gudrun · Galaxy Explorer',
      heading: 'Gudrun </script><script>alert(1)</script>',
      description: 'A hive world.',
      url: 'https://galaxy.test/u/a/m/view/1',
      image: { url: 'https://galaxy.test/media/g.webp', width: 10, height: 10, alt: null },
      noIndex: false,
      body: [],
      crumbs: [
        { name: 'Galaxy Explorer', url: 'https://galaxy.test/' },
        { name: 'A', url: 'https://galaxy.test/u/a' },
      ],
      links: null,
      found: true,
    });
    const block = /<script type="application\/ld\+json">(.*)<\/script>/.exec(html)?.[1] ?? '';
    expect(block).not.toContain('<');
    const data = JSON.parse(block) as Record<string, any>;
    expect(data['@type']).toBe('WebPage');
    expect(data.image).toBe('https://galaxy.test/media/g.webp');
    expect(data.isPartOf.url).toBe('https://galaxy.test/');
    expect(data.breadcrumb.itemListElement.map((item: any) => item.item)).toEqual([
      'https://galaxy.test/',
      'https://galaxy.test/u/a',
      'https://galaxy.test/u/a/m/view/1',
    ]);
    expect(data.breadcrumb.itemListElement[2].name).toBe(
      'Gudrun </script><script>alert(1)</script>',
    );
  });
});
