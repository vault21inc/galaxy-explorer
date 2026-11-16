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

/**
 * The guided tours' first-visit offers (M8-T10) stay away unless a spec asks for them with
 * `test.use({ tourOffers: true })`: elsewhere they'd sit over the page every test looks at.
 * They're marked as already turned down, as a reader's browser would remember it.
 */
const TOURS_DISMISSED = JSON.stringify({
  state: { dismissed: { reader: true, editor: true } },
  version: 1,
});

export const test = base.extend<{
  cspGuard: undefined;
  tourOffers: boolean;
  quietTours: undefined;
}>({
  tourOffers: [false, { option: true }],
  quietTours: [
    async ({ context, tourOffers }, use) => {
      if (!tourOffers) {
        await context.addInitScript((stored) => {
          try {
            if (localStorage.getItem('ge.tours') === null) localStorage.setItem('ge.tours', stored);
          } catch {
            // Storage blocked: the offers would show, as they would for such a reader.
          }
        }, TOURS_DISMISSED);
      }
      await use(undefined);
    },
    { auto: true },
  ],
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
