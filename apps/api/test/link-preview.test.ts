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
    });
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<b>');
    expect(html).toContain('content="A &quot;quoted&quot; &lt;b&gt;name&lt;/b&gt;"');
    expect(html).toContain('Tom &amp; Jerry’s &lt;script&gt;');
    expect(html).toContain('<meta name="robots" content="noindex">');
    expect(html).not.toContain('og:image');
  });
});
