import { z } from 'zod/v4';

/**
 * Zod, as the web app gets it: vite.config.js points every `import … from 'zod'` here, so this
 * runs before any schema is made, wherever the bundler puts the modules.
 *
 * Zod compiles faster object parsers with `new Function` when it's allowed to, and checks once
 * whether it is. The site's Content-Security-Policy forbids it (M8-T3: no eval), so the browser
 * blocks the check, and Zod falls back, but the attempt still shows up as a violation in the
 * console and in the e2e tests' CSP guard. Each schema decides when it's made, so the setting
 * must come first. The browser parses little enough that the compiled parsers wouldn't matter;
 * the API keeps them.
 */
z.config({ jitless: true });

export * from 'zod/v4';
export { z, z as default };
