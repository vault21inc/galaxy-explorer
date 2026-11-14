import { writeFile } from 'node:fs/promises';
import { CADDY_SNIPPET_PATH, caddySnippet } from './security-headers.ts';

/**
 * `pnpm headers:caddy` (M8-T3): writes the Caddyfile snippet with the site's security headers
 * from packages/domain/src/security/headers.ts. The unit test in
 * test/security-headers.test.ts fails while the committed file is out of date.
 */
const target = new URL(`../../../../${CADDY_SNIPPET_PATH}`, import.meta.url);
await writeFile(target, caddySnippet());
console.log(`Wrote ${CADDY_SNIPPET_PATH}.`);
