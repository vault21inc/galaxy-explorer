import { writeFile } from 'node:fs/promises';
import { LINK_PREVIEW_SNIPPET_PATH, linkPreviewSnippet } from './link-preview-caddy.ts';
import { CADDY_SNIPPET_PATH, caddySnippet } from './security-headers.ts';

/**
 * `pnpm headers:caddy` (M8-T3, M8-T9): writes the Caddyfile snippets generated from the
 * domain package, the site's security headers (packages/domain/src/security/headers.ts) and
 * the link-preview routing (packages/domain/src/link-preview.ts). The unit tests in
 * test/security-headers.test.ts and test/link-preview.test.ts fail while a committed file is
 * out of date.
 */
const snippets: [path: string, text: string][] = [
  [CADDY_SNIPPET_PATH, caddySnippet()],
  [LINK_PREVIEW_SNIPPET_PATH, linkPreviewSnippet()],
];
for (const [path, text] of snippets) {
  await writeFile(new URL(`../../../../${path}`, import.meta.url), text);
  console.log(`Wrote ${path}.`);
}
