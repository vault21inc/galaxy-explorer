import { withTestDb } from '@ge/db/testing';
import { rt } from '@ge/domain';
import { describe, expect, it } from 'vitest';
import { buildServer } from '../src/server.ts';
import { testConfig } from './helpers.ts';

/**
 * The private preview (docs/ops/preview.md): behind its proxy, only requests marked
 * `X-GE-Role: editor` may write or read drafts. Readers get 403s, and edit mode isn't offered.
 */
describe('preview roles', () => {
  it('lets the editor write and keeps readers to published content', () =>
    withTestDb(async (_db, url) => {
      const app = await buildServer(testConfig({ databaseUrl: url, previewRoles: true }));
      try {
        const editor = { 'x-ge-role': 'editor' };
        const reader = { 'x-ge-role': 'reader' };
        const health = async (headers: Record<string, string>) =>
          (await app.inject({ method: 'GET', url: '/api/health', headers })).json<{
            data: { canEdit: boolean };
          }>().data.canEdit;
        expect(await health(editor)).toBe(true);
        expect(await health(reader)).toBe(false);
        // No header at all is a reader: the proxy marks the editor, nothing else does.
        expect(await health({})).toBe(false);

        const created = await app.inject({
          method: 'POST',
          url: '/api/v1/universes',
          headers: editor,
          payload: { slug: 'preview', name: rt.plain('Preview') },
        });
        expect(created.statusCode).toBe(201);

        const refused = await app.inject({
          method: 'POST',
          url: '/api/v1/universes',
          headers: reader,
          payload: { slug: 'nope', name: rt.plain('Nope') },
        });
        expect(refused.statusCode).toBe(403);
        expect(refused.json()).toMatchObject({ detail: 'This preview is read-only.' });

        const read = await app.inject({ method: 'GET', url: '/api/v1/universes', headers: reader });
        expect(read.statusCode).toBe(200);
        const drafts = await app.inject({
          method: 'GET',
          url: '/api/v1/universes?includeDrafts=true',
          headers: reader,
        });
        expect(drafts.statusCode).toBe(403);
      } finally {
        await app.close();
      }
    }));
});
