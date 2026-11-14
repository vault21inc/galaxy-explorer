import { test as base } from '@playwright/test';

/**
 * Playwright's `test`, with a guard that fails any test whose pages break the site's
 * Content-Security-Policy (M8-T3). `vite preview` serves the production build with the policy
 * the site sends (`preview.headers` in vite.config.js), so a library that injects an inline
 * script, or a payload that gets an event handler onto the page, is reported here even though
 * the browser blocked it. Specs import `test` from here, not from '@playwright/test' (an ESLint
 * rule says so); everything else is Playwright's own.
 */
export * from '@playwright/test';

/** What the browser reported, enough to find the cause. */
interface Violation {
  directive: string;
  blocked: string;
  source: string;
  line: number;
  sample: string;
}

export const test = base.extend<{ cspGuard: undefined }>({
  cspGuard: [
    async ({ context }, use) => {
      const violations: Violation[] = [];
      // Every page of the test's context reports to this test, across navigations.
      await context.exposeBinding('__geCspViolation', (_source, violation: Violation) => {
        violations.push(violation);
      });
      await context.addInitScript(() => {
        const report = (window as unknown as { __geCspViolation: (v: Violation) => void })
          .__geCspViolation;
        document.addEventListener('securitypolicyviolation', (event) => {
          report({
            directive: event.effectiveDirective,
            blocked: event.blockedURI,
            source: event.sourceFile,
            line: event.lineNumber,
            sample: event.sample,
          });
        });
      });
      await use(undefined);
      // Reports arrive as events: give the last ones a moment to land.
      await new Promise((settle) => setTimeout(settle, 100));
      base
        .expect(violations, 'The page broke the Content-Security-Policy (vite.config.js).')
        .toEqual([]);
    },
    { auto: true },
  ],
});
