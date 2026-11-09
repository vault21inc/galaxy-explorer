import type { Database } from '@ge/db';
import { AssetMetadata, AssetRead, MAX_UPLOAD_BYTES } from '@ge/domain';
import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { inBatch } from '../http/batch.ts';
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
import { ASSET_KEY_PATTERN, type LocalBlobStore } from '../storage/blob-store.ts';
import { processImage, sha256Of } from '../storage/image-pipeline.ts';

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
        response: { 200: envelope(AssetRead), 201: envelope(AssetRead), ...problemResponses },
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

/**
 * `/media/*` in development and tests (architecture.md §8): the stored variants, read from
 * `GE_MEDIA_DIR`. Only keys of the shape uploads produce are served, so no other file under the
 * directory (or outside it) can be asked for. Production serves the same paths from Caddy.
 */
export const mediaRoutes: FastifyPluginCallbackZod<{ store: LocalBlobStore }> = (
  app,
  { store },
  done,
) => {
  app.get('/media/*', { schema: { hide: true } }, async (request, reply) => {
    const key = (request.params as { '*': string })['*'];
    const data = ASSET_KEY_PATTERN.test(key) ? await store.get(key) : null;
    if (!data) {
      // The usual 404 problem; returning the reply tells Fastify it has been sent.
      reply.callNotFound();
      return reply;
    }
    // A key names one asset's one variant, which never changes: cache it for good.
    return reply
      .type('image/webp')
      .header('cache-control', 'public, max-age=31536000, immutable')
      .header('x-content-type-options', 'nosniff')
      .send(data);
  });
  done();
};
