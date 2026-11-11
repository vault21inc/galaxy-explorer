import type { FastifyInstance, FastifyRequest } from 'fastify';
import { problem } from './problems.ts';

/**
 * The private preview (docs/ops/preview.md): before logins exist (M8-T1), the API runs with
 * `GE_AUTH_MODE=none` behind a Caddy proxy that asks everyone for a password and tells the API
 * who may edit, with the `X-GE-Role` header. The proxy sets that header itself on every
 * request, overwriting whatever the browser sent, and the API listens only on 127.0.0.1, so the
 * header can't be forged from outside.
 *
 * With `GE_PREVIEW_ROLES=on`, a request is the editor's only if the proxy marked it `editor`.
 * Anything else is a reader's: it may read published content, and no more. Off (the default,
 * and on your own machine), every request may do everything, as before.
 */
export const ROLE_HEADER = 'x-ge-role';

/** Methods that read; every other one writes. */
const READS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function isEditor(request: FastifyRequest, previewRoles: boolean): boolean {
  return !previewRoles || request.headers[ROLE_HEADER] === 'editor';
}

/** Refuses a reader's writes, and their reads of drafts, with 403s that say why. */
export function guardPreviewRoles(app: FastifyInstance, previewRoles: boolean): void {
  if (!previewRoles) return;
  app.addHook('onRequest', async (request, reply) => {
    if (isEditor(request, previewRoles) || !request.url.startsWith('/api/')) return;
    if (!READS.has(request.method)) {
      return reply
        .code(403)
        .type('application/problem+json')
        .send(problem(403, 'This preview is read-only.'));
    }
    // Drafts are the editor's work in progress (architecture.md §10).
    const query = request.query as Record<string, unknown> | undefined;
    if (query?.includeDrafts === 'true') {
      return reply
        .code(403)
        .type('application/problem+json')
        .send(problem(403, 'Drafts are visible only to the editor.'));
    }
  });
}
