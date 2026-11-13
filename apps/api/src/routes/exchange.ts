import type { Database } from '@ge/db';
import { CSV_COLUMNS, exportJsonSchema, IMPORT_MODES, ImportReport } from '@ge/domain';
import type { FastifyReply } from 'fastify';
import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { exportZip } from '../exchange/export-service.ts';
import { importUpload } from '../exchange/import-service.ts';
import { MAX_IMPORT_BYTES } from '../exchange/zip.ts';
import { actorOf } from '../http/batch.ts';
import { isEditor } from '../http/preview-roles.ts';
import { problem } from '../http/problems.ts';
import { envelope, problemResponses } from '../http/schemas.ts';
import { InvalidRequest } from '../services/errors.ts';
import { requireMap } from '../services/lookup.ts';
import type { BlobStore } from '../storage/blob-store.ts';

/**
 * Import and export (M7-T4, architecture.md §5): a universe or map as a zip of JSON files and
 * images, and back. The format is `/api/v1/export-schema.json`.
 */

const EXPORT_DOC =
  'A zip: manifest.json, universe.json (the universe’s fields, assets, settings rows and characters), maps/<slug>.json (each map’s entries with their facts, images, links, citations, locations, members and waypoints, and its relations) and assets/<sha256>/<variant>.webp. ' +
  'Records refer to each other by reference, never by id: an entry by its externalKey or ref, a settings row by its name (a field definition by its key), an asset by its sha256. Drafts and spoilers are included. JSON Schema: /api/v1/export-schema.json.';

const IMPORT_DOC = `Send \`multipart/form-data\` with one file in a field named \`file\`: an export's zip, or a CSV of objects with the columns ${CSV_COLUMNS.join(', ')} (a CSV needs \`mapId\`). At most ${String(MAX_IMPORT_BYTES / 1024 / 1024)} MB.

\`mode=create\` adds everything as new entries; a key or map slug already used is a conflict. \`mode=merge\` updates entries by their externalKey and adds the rest, leaving out entries without a key. Settings rows, assets and maps are matched by name, hash and slug in both modes. For an entry a merge updates, each aspect the file lists (facts, images, links…) replaces the entry's; an aspect the file leaves out stays.

\`dryRun=true\` does everything, reports it and rolls back: use it first. A real import is one change batch (one undo). If the report has conflicts or unresolved references, nothing is written and the answer is 409 with \`report\`.`;

export const exchangeRoutes: FastifyPluginCallbackZod<{
  db: Database;
  store: BlobStore;
  version: string;
  previewRoles: boolean;
}> = (app, { db, store, version, previewRoles }, done) => {
  const generator = `Galaxy Explorer ${version}`;

  /** Exports include drafts: on the private preview, only its editor may take one. */
  const refuseReaders = (request: Parameters<typeof isEditor>[0]) =>
    isEditor(request, previewRoles)
      ? undefined
      : problem(403, 'Only the editor may export: an export includes drafts.');

  const sendZip = (reply: FastifyReply, file: { filename: string; zip: Uint8Array }) =>
    reply
      .header('content-disposition', `attachment; filename="${file.filename}"`)
      .type('application/zip')
      .send(Buffer.from(file.zip));

  app.get(
    '/universes/:universeId/export',
    {
      schema: {
        tags: ['exchange'],
        summary: 'Export a universe as a zip',
        description: EXPORT_DOC,
        operationId: 'universes.export',
        params: z.object({ universeId: z.uuid() }),
        // A zip, not JSON: no response schema, so Fastify sends the bytes as they are.
        produces: ['application/zip'],
      },
    },
    async (request, reply) => {
      const refused = refuseReaders(request);
      if (refused) return reply.code(403).type('application/problem+json').send(refused);
      return sendZip(reply, await exportZip(db, store, request.params.universeId, { generator }));
    },
  );

  app.get(
    '/maps/:mapId/export',
    {
      schema: {
        tags: ['exchange'],
        summary: 'Export one map as a zip',
        description: `The map, with the universe’s settings rows, assets and characters it may use. ${EXPORT_DOC}`,
        operationId: 'maps.export',
        params: z.object({ mapId: z.uuid() }),
        // A zip, not JSON: no response schema, so Fastify sends the bytes as they are.
        produces: ['application/zip'],
      },
    },
    async (request, reply) => {
      const refused = refuseReaders(request);
      if (refused) return reply.code(403).type('application/problem+json').send(refused);
      const map = await requireMap(db, request.params.mapId);
      return sendZip(
        reply,
        await exportZip(db, store, map.universeId, { generator, mapId: map.id }),
      );
    },
  );

  app.post(
    '/universes/:universeId/import',
    {
      schema: {
        tags: ['exchange'],
        summary: 'Import an export’s zip, or a CSV of objects',
        description: IMPORT_DOC,
        operationId: 'universes.import',
        consumes: ['multipart/form-data'],
        params: z.object({ universeId: z.uuid() }),
        querystring: z.object({
          mode: z.enum(IMPORT_MODES).default('create'),
          dryRun: z
            .enum(['true', 'false'])
            .default('false')
            .transform((value) => value === 'true'),
          mapId: z.uuid().optional().describe('For a CSV: the map its objects go on.'),
        }),
        response: { 200: envelope(ImportReport), ...problemResponses },
      },
    },
    async (request, reply) => {
      const part = await request.file({ limits: { fileSize: MAX_IMPORT_BYTES, files: 1 } });
      if (!part) throw new InvalidRequest('Send the file as a multipart field named "file".');
      // Throws 413 past the size limit (@fastify/multipart).
      const data = await part.toBuffer();
      const { mode, dryRun, mapId } = request.query;
      const report = await importUpload(
        db,
        store,
        actorOf(request),
        request.params.universeId,
        data,
        {
          filename: part.filename.trim() || 'upload',
          mode,
          dryRun,
          mapId,
        },
      );
      if (report.batchId) void reply.header('x-ge-batch-id', report.batchId);
      return { data: report };
    },
  );

  app.get(
    '/export-schema.json',
    {
      schema: {
        tags: ['exchange'],
        summary: 'The export format, as JSON Schema',
        description:
          'The files of an export zip, for tools and LLM agents that write imports: manifest.json, universe.json and maps/<slug>.json.',
        operationId: 'exchange.schema',
      },
    },
    () => exportJsonSchema(),
  );

  done();
};
