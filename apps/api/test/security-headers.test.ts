import { readFile } from 'node:fs/promises';
import {
  API_CSP,
  cspHeader,
  SECURITY_HEADERS,
  WEB_APP_CSP,
  WEB_APP_HEADERS,
} from '@ge/domain/security';
import { describe, expect, it } from 'vitest';
import { CADDY_SNIPPET_PATH, caddySnippet, swaggerUiCsp } from '../src/http/security-headers.ts';
import { buildServer } from '../src/server.ts';
import { testConfig } from './helpers.ts';

/** The security headers (M8-T3): one list, sent by Caddy, the API and `vite preview`. */

describe('the security headers', () => {
  it('keep scripts to the site’s own files, and the site out of frames', () => {
    expect(WEB_APP_CSP['script-src']).toEqual(["'self'"]);
    expect(WEB_APP_CSP['object-src']).toEqual(["'none'"]);
    expect(WEB_APP_CSP['frame-ancestors']).toEqual(["'none'"]);
    expect(WEB_APP_HEADERS['Content-Security-Policy']).toBe(cspHeader(WEB_APP_CSP));
    expect(cspHeader(API_CSP)).toBe("default-src 'none'; frame-ancestors 'none'");
  });

  it('are the ones in the committed Caddy snippet (`pnpm headers:caddy` writes it)', async () => {
    const committed = await readFile(new URL(`../../../${CADDY_SNIPPET_PATH}`, import.meta.url));
    expect(committed.toString(), 'Run `pnpm headers:caddy` and commit the result.').toBe(
      caddySnippet(),
    );
  });

  it('keep the API docs page’s own policy, without the upgrade to HTTPS or framing', () => {
    expect(
      swaggerUiCsp(
        "default-src 'self'; frame-ancestors 'self'; script-src 'self'; style-src 'self' https:; upgrade-insecure-requests;",
      ),
    ).toBe(
      "default-src 'self'; frame-ancestors 'none'; script-src 'self'; style-src 'self' https: 'unsafe-inline'",
    );
  });
});

describe('the API sends them', () => {
  const headersOf = async (url: string) => {
    const app = await buildServer(testConfig());
    try {
      return (await app.inject({ method: 'GET', url })).headers;
    } finally {
      await app.close();
    }
  };

  it('on its responses, with its own policy, errors included', async () => {
    for (const url of ['/api/openapi.json', '/api/v1/no-such-route']) {
      const headers = await headersOf(url);
      for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
        expect(headers[name.toLowerCase()], `${name} on ${url}`).toBe(value);
      }
      expect(headers['content-security-policy']).toBe(cspHeader(API_CSP));
    }
  });

  it('with the docs page’s policy on the docs page', async () => {
    const headers = await headersOf('/api/docs/static/index.html');
    const policy = String(headers['content-security-policy']);
    // Swagger UI's own files only: it has no inline script.
    expect(policy).toMatch(/script-src 'self'(;| 'sha256-)/);
    expect(policy).toContain("frame-ancestors 'none'");
    expect(policy).not.toContain('upgrade-insecure-requests');
    expect(headers['x-content-type-options']).toBe('nosniff');
  });
});
