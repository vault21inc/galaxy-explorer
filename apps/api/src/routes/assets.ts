import type { Database } from '@ge/db';
import { AssetMetadata, AssetRead, MAX_UPLOAD_BYTES } from '@ge/domain';
import type { FastifyRequest } from 'fastify';
import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { inBatch } from '../http/batch.ts';
import { problem, problemSchema } from '../http/problems.ts';
import { accessFactsOf, universeAccess } from '../services/access.ts';
import { envelope, listQuery, page, problemResponses } from '../http/schemas.ts';
import {
  findDuplicate,
  getAsset,
  listAssets,
  storeAsset,
  updateAssetMetadata,
} from '../services/asset-service.ts';
import { InvalidRequest } from '../services/errors.ts';
import { requireUniverse } from '../services/lookup.ts';
import { requireMediaRoom } from '../services/quota.ts';
import { ASSET_KEY_PATTERN, type LocalBlobStore } from '../storage/blob-store.ts';
import { processImage, sha256Of } from '../storage/image-pipeline.ts';
import { routeAccess } from '../http/access-guard.ts';

const ASSETS_DOC =
  "Images uploaded to a universe (A5). Uploads are re-encoded as WebP in two sizes (thumb, 256 px; display, 1,600 px), which leaves EXIF and other embedded data behind. Attach one to an entity with POST /entities/{id}/images. `urls` are this site's /media/ paths.";

/**
 * Uploads and the image library (M3-T7, architecture.md §8): `POST` stores a new image as one
 * change batch, or returns the one already uploaded with the same bytes.
 */
export const assetRoutes: FastifyPluginCallbackZod<{ db: Database; store: LocalBlobStore }> = (
  app,
  { db, store },
  done,
) => {
  const universeParams = z.object({ universeId: z.uuid() });
  const assetParams = z.object({ assetId: z.uuid() });

  app.post(
    '/universes/:universeId/assets',
    {
      schema: {
        tags: ['assets'],
        summary: 'Upload an image',
        description: `${ASSETS_DOC}\n\nSend \`multipart/form-data\` with the image in a field named \`file\`: PNG, JPEG, WebP, AVIF or GIF (first frame), at most 25 MB. The type is read from the bytes, not the name. The same image uploaded again returns the existing asset with 200; a new one is 201. Set alt text and credit afterwards with PATCH /assets/{id}.`,
        operationId: 'assets.upload',
        consumes: ['multipart/form-data'],
        params: universeParams,
        response: {
          200: envelope(AssetRead),
          201: envelope(AssetRead),
          ...problemResponses,
          413: problemSchema.describe('Too large, or past the owner’s media quota (M8-T11).'),
        },
      },
    },
    async (request, reply) => {
      const { universeId } = request.params;
      await requireUniverse(db, universeId);
      const part = await request.file({ limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } });
      if (!part) throw new InvalidRequest('Send the image as a multipart field named "file".');
      // Throws 413 past the size limit (@fastify/multipart).
      const data = await part.toBuffer();

      const duplicate = await findDuplicate(db, universeId, sha256Of(data));
      if (duplicate) return reply.code(200).send({ data: duplicate });
      // A new image counts against the universe's owner's media quota (M8-T11).
      await requireMediaRoom(db, universeId, data.length);

      const image = await processImage(data);
      const name = part.filename.trim() || null;
      try {
        const asset = await inBatch(
          db,
          request,
          reply,
          name ? `Upload “${name}”` : 'Upload image',
          { universeId },
          (tx) =>
            storeAsset(tx, store, {
              universeId,
              image,
              byteSize: data.length,
              originalFilename: name,
            }),
        );
        return await reply.code(201).send({ data: asset });
      } catch (error) {
        // Two uploads of the same file at once: the second loses the unique index race.
        const again = await findDuplicate(db, universeId, image.sha256);
        if (again) return reply.code(200).send({ data: again });
        throw error;
      }
    },
  );

  app.get(
    '/universes/:universeId/assets',
    {
      schema: {
        tags: ['assets'],
        summary: "List a universe's images, newest first",
        description: ASSETS_DOC,
        operationId: 'assets.list',
        ...routeAccess({ scope: 'universe', level: 'edit' }),
        params: universeParams,
        querystring: listQuery,
        response: { 200: page(AssetRead), ...problemResponses },
      },
    },
    async (request) => {
      await requireUniverse(db, request.params.universeId);
      const { cursor, limit } = request.query;
      const result = await listAssets(db, request.params.universeId, {
        limit,
        ...(cursor ? { cursor } : {}),
      });
      return { data: result.items, nextCursor: result.nextCursor } as never;
    },
  );

  app.get(
    '/assets/:assetId',
    {
      schema: {
        tags: ['assets'],
        summary: 'Get an image',
        description: ASSETS_DOC,
        operationId: 'assets.get',
        ...routeAccess({ scope: 'universe', level: 'edit' }),
        params: assetParams,
        response: { 200: envelope(AssetRead), ...problemResponses },
      },
    },
    async (request) => ({ data: await getAsset(db, request.params.assetId) }),
  );

  app.patch(
    '/assets/:assetId',
    {
      schema: {
        tags: ['assets'],
        summary: "Change an image's alt text, credit, source or license",
        description: `${ASSETS_DOC} Empty text clears a field. The credit is shown under the image wherever it appears.`,
        operationId: 'assets.update',
        params: assetParams,
        body: AssetMetadata,
        response: { 200: envelope(AssetRead), ...problemResponses },
      },
    },
    async (request, reply) => {
      const current = await getAsset(db, request.params.assetId);
      const data = await inBatch(
        db,
        request,
        reply,
        `Edit image “${current.originalFilename ?? 'image'}”`,
        { universeId: current.universeId },
        (tx) => updateAssetMetadata(tx, request.params.assetId, request.body),
      );
      return { data };
    },
  );

  done();
};

/** A media file's universe: the `{universeId}` in `u/{universeId}/{assetId}/{variant}.webp`. */
function universeOfKey(key: string): string | null {
  return ASSET_KEY_PATTERN.test(key) ? (key.split('/')[1] ?? null) : null;
}

/**
 * Whether the requester may see a media file (M8-T11, architecture.md §8): only with at least
 * `read` on its universe. Files of public universes may be cached by anyone; the others only
 * by the browser that asked (`Cache-Control: private`). Null: a 404.
 */
async function mediaHeaders(
  db: Database,
  request: FastifyRequest,
  key: string,
): Promise<Record<string, string> | null> {
  const universeId = universeOfKey(key);
  if (!universeId) return null;
  const facts = (await accessFactsOf(db, request.requester, [universeId])).get(universeId);
  if (!facts || universeAccess(request.requester, facts) === 'none') return null;
  if (facts.visibility === 'public') {
    // Files never change once written: a new upload is a new key.
    return { 'cache-control': 'public, max-age=31536000, immutable' };
  }
  // Kept out of shared caches and search engines, like the universe (M8-T12).
  return { 'cache-control': 'private, max-age=31536000, immutable', 'x-robots-tag': 'noindex' };
}

/**
 * `GET /api/v1/media-access` (M8-T11): in production Caddy serves the media files itself, after
 * asking this route about each request (`forward_auth`, M8-T4), which passes the browser's
 * cookies and the file's path in `X-Forwarded-Uri`. 204 with the `Cache-Control` to send, or 404.
 */
export const mediaAccessRoutes: FastifyPluginCallbackZod<{ db: Database }> = (
  app,
  { db },
  done,
) => {
  app.get(
    '/media-access',
    {
      schema: {
        tags: ['assets'],
        summary: 'May this browser see a media file?',
        description:
          'For the proxy in front of /media (Caddy’s forward_auth): reads the file’s path from `X-Forwarded-Uri`, such as `/media/u/{universeId}/{assetId}/display.webp`, and answers 204 with the `Cache-Control` (and, for a universe that isn’t public, `X-Robots-Tag`) to send if the requester can read its universe, else 404.',
        operationId: 'media.access',
        // It checks the file's universe itself, from the forwarded path.
        ...routeAccess({ scope: 'open' }),
        response: { 204: z.null(), ...problemResponses },
      },
    },
    async (request, reply) => {
      const uri = request.headers['x-forwarded-uri'];
      const path = typeof uri === 'string' ? (uri.split('?')[0] ?? '') : '';
      const key = path.startsWith('/media/') ? path.slice('/media/'.length) : '';
      const headers = await mediaHeaders(db, request, key);
      if (!headers) {
        return reply.code(404).type('application/problem+json').send(problem(404, 'Not found.'));
      }
      return reply.headers(headers).code(204).send(null);
    },
  );
  done();
};

/**
 * `/media/*` in development and tests (architecture.md §8): the stored variants, read from
 * `GE_MEDIA_DIR`. Only keys of the shape uploads produce are served, so no other file under the
 * directory (or outside it) can be asked for, and only to someone who can read their universe
 * (M8-T11). Production serves the same paths from Caddy, after asking `/api/v1/media-access`.
 */
export const mediaRoutes: FastifyPluginCallbackZod<{ db: Database; store: LocalBlobStore }> = (
  app,
  { db, store },
  done,
) => {
  app.get('/media/*', { schema: { hide: true } }, async (request, reply) => {
    const key = (request.params as { '*': string })['*'];
    const headers = await mediaHeaders(db, request, key);
    const data = headers ? await store.get(key) : null;
    if (!headers || !data) {
      reply.callNotFound();
      return reply;
    }
    return reply
      .type('image/webp')
      .headers(headers)
      .header('x-content-type-options', 'nosniff')
      .send(data);
  });
  done();
};
