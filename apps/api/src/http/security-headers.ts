import type { FastifyInstance } from 'fastify';
import { API_CSP, cspHeader, SECURITY_HEADERS, WEB_APP_CSP } from '@ge/domain/security';

/**
 * The security headers on the API's own responses (M8-T3, architecture.md §14).
 *
 * Caddy sets the common ones on every response of the site, and a proxy adds what the API
 * sends rather than replacing it, so the API adds them only when no proxy is in front: a
 * request without `X-Forwarded-For`, which Caddy (and any proxy) always sends. That's the
 * fallback, for development, tests and anything that reaches the API some other way.
 *
 * The Content-Security-Policy is the API's own (`API_CSP`), always: it serves data and images,
 * never a page that runs anything. Behind Caddy it comes with the site's, and browsers enforce
 * both, so the stricter wins. A response that brings its own keeps it: the API docs page
 * (`swaggerUiCsp` below).
 */
export function registerSecurityHeaders(app: FastifyInstance): void {
  const apiCsp = cspHeader(API_CSP);
  app.addHook('onSend', async (request, reply, payload) => {
    if (request.headers['x-forwarded-for'] === undefined) {
      for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
        if (!reply.hasHeader(name)) void reply.header(name, value);
      }
    }
    if (!reply.hasHeader('content-security-policy')) {
      void reply.header('content-security-policy', apiCsp);
    }
    return payload;
  });
}

/**
 * The API docs page (`/api/docs`, Swagger UI) runs scripts, so it gets a policy of its own:
 * @fastify/swagger-ui's, which allows only its own script files. Three changes:
 * - no `upgrade-insecure-requests`, which would send the page's requests over HTTPS even in
 *   development, where there is none (Strict-Transport-Security does that job);
 * - nothing may frame it;
 * - inline styles, which Swagger UI's components add as they render, as the web app's do
 *   (WEB_APP_CSP). Styles can't run code.
 */
export function swaggerUiCsp(header: string): string {
  return header
    .split(';')
    .map((directive) => directive.trim())
    .filter((directive) => directive !== '' && directive !== 'upgrade-insecure-requests')
    .map((directive) => {
      if (directive.startsWith('frame-ancestors ')) return "frame-ancestors 'none'";
      if (directive.startsWith('style-src ') && !directive.includes("'unsafe-inline'")) {
        return `${directive} 'unsafe-inline'`;
      }
      return directive;
    })
    .join('; ');
}

/** Where `pnpm headers:caddy` writes the snippet, from the repository root. */
export const CADDY_SNIPPET_PATH = 'ops/caddy/security-headers.caddy';

/** A header value in Caddyfile quotes; none of ours has a quote or newline to escape. */
function quoted(value: string): string {
  if (/["\n\\]/.test(value)) throw new Error(`Can't write ${value} in a Caddyfile.`);
  return `"${value}"`;
}

/**
 * The Caddyfile snippet with the site's security headers, generated from the same list as
 * the API's (packages/domain/src/security/headers.ts). A Caddyfile imports the file at its top
 * level, then each site says `import security-headers`.
 *
 * The headers are set as each request comes in, not as its response is written (Caddy's
 * deferred `>`, `?` and `-`): Caddy writes an error response, such as the 401 asking for the
 * preview's password or a 404, without the deferred ones. The API leaves the common ones to
 * Caddy (`registerSecurityHeaders`), so nothing is doubled; its own policy joins the site's.
 * Only deleting `Server` is deferred, in a block of its own, since a block with any deferred
 * operation is deferred whole.
 */
export function caddySnippet(): string {
  const lines = [
    '# The site’s security headers (M8-T3, architecture.md §14). Generated from',
    '# packages/domain/src/security/headers.ts by `pnpm headers:caddy`: edit that, not this.',
    '#',
    '# Import this file at the top of a Caddyfile, then `import security-headers` in the site.',
    '',
    '(security-headers) {',
    '\t# Set as each request comes in, so that every response has them, errors included.',
    '\theader {',
    ...Object.entries(SECURITY_HEADERS).map(([name, value]) => `\t\t${name} ${quoted(value)}`),
    '\t\t# The web app’s policy. The API adds its own, stricter one, and browsers enforce both.',
    `\t\tContent-Security-Policy ${quoted(cspHeader(WEB_APP_CSP))}`,
    '\t}',
    '\t# Which server software this is helps nobody but an attacker. (Deleting is deferred, so',
    '\t# it has a block of its own.)',
    '\theader -Server',
    '}',
    '',
  ];
  return lines.join('\n');
}
