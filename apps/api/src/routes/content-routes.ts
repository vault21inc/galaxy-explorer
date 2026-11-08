import type { Database } from '@ge/db';
import {
  FactRead,
  FactWrite,
  IMAGE_ROLES,
  ImageRead,
  ImageWrite,
  LinkRead,
  LinkWrite,
  RelationRead,
  RelationWrite,
} from '@ge/domain';
import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { envelope, problemResponses } from '../http/schemas.ts';
import {
  addLink,
  addRelation,
  attachImage,
  detachImage,
  removeFact,
  removeLink,
  removeRelation,
  setFact,
  updateImage,
  updateLink,
  updateRelation,
} from '../services/aspects/content.ts';
import { requireOwner } from '../services/aspects/owner.ts';
import {
  listFacts,
  listImages,
  listLinks,
  listRelations,
  withOtherEnds,
} from '../services/aspects/read.ts';
import { SEES_EVERYTHING, visibleTo } from '../services/visibility.ts';
import { actorOf } from '../http/batch.ts';
import { ASPECT_DOC, aspectWriter, deleted, entityParams, list } from './aspect-helpers.ts';

/** Images, links, facts and relations of any entity, under `/entities/{entityId}/…` (data-model §3.4). */
export const contentRoutes: FastifyPluginCallbackZod<{ db: Database }> = (app, { db }, done) => {
  const write = aspectWriter(db);

  // ---- images ----
  const imageParams = entityParams.extend({ assetId: z.uuid(), role: z.enum(IMAGE_ROLES) });
  app.get(
    '/entities/:entityId/images',
    {
      schema: {
        tags: ['images'],
        summary: "List an entity's images",
        description: ASPECT_DOC,
        operationId: 'images.list',
        params: entityParams,
        response: { 200: list(ImageRead), ...problemResponses },
      },
    },
    async (request) => {
      await requireOwner(db, request.params.entityId);
      return { data: await listImages(db, request.params.entityId) } as never;
    },
  );
  app.post(
    '/entities/:entityId/images',
    {
      schema: {
        tags: ['images'],
        summary: 'Attach an uploaded image',
        description: `${ASPECT_DOC} Role "cover", "surface_texture" and "cloud_texture" are one per entity; "gallery" is any number.`,
        operationId: 'images.attach',
        params: entityParams,
        body: ImageWrite,
        response: { 201: envelope(ImageRead), ...problemResponses },
      },
    },
    async (request, reply) => {
      const data = await write(request, reply, request.params.entityId, 'Attach image', (tx) =>
        attachImage(tx, request.params.entityId, request.body),
      );
      return reply.code(201).send({ data } as never);
    },
  );
  app.patch(
    '/entities/:entityId/images/:assetId/:role',
    {
      schema: {
        tags: ['images'],
        summary: "Change an image's caption, role, order or spoiler flag",
        description: ASPECT_DOC,
        operationId: 'images.update',
        params: imageParams,
        body: ImageWrite.partial(),
        response: { 200: envelope(ImageRead), ...problemResponses },
      },
    },
    async (request, reply) => {
      const data = await write(request, reply, request.params.entityId, 'Edit image', (tx) =>
        updateImage(tx, request.params, request.body),
      );
      return { data } as never;
    },
  );
  app.delete(
    '/entities/:entityId/images/:assetId/:role',
    {
      schema: {
        tags: ['images'],
        summary: 'Detach an image (the upload stays)',
        description: ASPECT_DOC,
        operationId: 'images.detach',
        params: imageParams,
        response: deleted,
      },
    },
    async (request, reply) => {
      await write(request, reply, request.params.entityId, 'Detach image', (tx) =>
        detachImage(tx, request.params),
      );
      return reply.code(204).send(null);
    },
  );

  // ---- links ----
  const linkParams = entityParams.extend({ linkId: z.uuid() });
  app.get(
    '/entities/:entityId/links',
    {
      schema: {
        tags: ['links'],
        summary: "List an entity's links",
        description: ASPECT_DOC,
        operationId: 'links.list',
        params: entityParams,
        response: { 200: list(LinkRead), ...problemResponses },
      },
    },
    async (request) => {
      await requireOwner(db, request.params.entityId);
      return { data: await listLinks(db, request.params.entityId) } as never;
    },
  );
  app.post(
    '/entities/:entityId/links',
    {
      schema: {
        tags: ['links'],
        summary: 'Add a link',
        description: `${ASPECT_DOC} Links are http or https URLs, such as the wiki page the entry is based on.`,
        operationId: 'links.add',
        params: entityParams,
        body: LinkWrite,
        response: { 201: envelope(LinkRead), ...problemResponses },
      },
    },
    async (request, reply) => {
      const data = await write(request, reply, request.params.entityId, 'Add link', (tx) =>
        addLink(tx, request.params.entityId, request.body),
      );
      return reply.code(201).send({ data } as never);
    },
  );
  app.patch(
    '/entities/:entityId/links/:linkId',
    {
      schema: {
        tags: ['links'],
        summary: 'Change a link',
        description: ASPECT_DOC,
        operationId: 'links.update',
        params: linkParams,
        body: LinkWrite.partial(),
        response: { 200: envelope(LinkRead), ...problemResponses },
      },
    },
    async (request, reply) => {
      const data = await write(request, reply, request.params.entityId, 'Edit link', (tx) =>
        updateLink(tx, request.params.linkId, request.body),
      );
      return { data } as never;
    },
  );
  app.delete(
    '/entities/:entityId/links/:linkId',
    {
      schema: {
        tags: ['links'],
        summary: 'Remove a link',
        description: ASPECT_DOC,
        operationId: 'links.remove',
        params: linkParams,
        response: deleted,
      },
    },
    async (request, reply) => {
      await write(request, reply, request.params.entityId, 'Remove link', (tx) =>
        removeLink(tx, request.params.linkId),
      );
      return reply.code(204).send(null);
    },
  );

  // ---- facts ----
  const factParams = entityParams.extend({ fieldDefinitionId: z.uuid() });
  const FactBody = FactWrite.omit({ fieldDefinitionId: true });
  app.get(
    '/entities/:entityId/facts',
    {
      schema: {
        tags: ['facts'],
        summary: "List an entity's facts",
        description: ASPECT_DOC,
        operationId: 'facts.list',
        params: entityParams,
        response: { 200: list(FactRead), ...problemResponses },
      },
    },
    async (request) => {
      await requireOwner(db, request.params.entityId);
      return { data: await listFacts(db, request.params.entityId) } as never;
    },
  );
  app.put(
    '/entities/:entityId/facts/:fieldDefinitionId',
    {
      schema: {
        tags: ['facts'],
        summary: 'Set a fact',
        description: `${ASPECT_DOC} The value's type must be the field definition's value type, and the field must apply to this entity.`,
        operationId: 'facts.set',
        params: factParams,
        body: FactBody,
        response: { 200: envelope(FactRead), ...problemResponses },
      },
    },
    async (request, reply) => {
      const { entityId, fieldDefinitionId } = request.params;
      const data = await write(request, reply, entityId, 'Set fact', (tx) =>
        setFact(tx, entityId, { ...request.body, fieldDefinitionId }),
      );
      return { data } as never;
    },
  );
  app.delete(
    '/entities/:entityId/facts/:fieldDefinitionId',
    {
      schema: {
        tags: ['facts'],
        summary: 'Remove a fact',
        description: ASPECT_DOC,
        operationId: 'facts.remove',
        params: factParams,
        response: deleted,
      },
    },
    async (request, reply) => {
      const { entityId, fieldDefinitionId } = request.params;
      await write(request, reply, entityId, 'Remove fact', (tx) =>
        removeFact(tx, entityId, fieldDefinitionId),
      );
      return reply.code(204).send(null);
    },
  );

  // ---- relations ----
  const relationParams = entityParams.extend({ relationId: z.uuid() });
  const RelationPatch = RelationWrite.pick({
    role: true,
    isSpoiler: true,
    sortKey: true,
  }).partial();
  app.get(
    '/entities/:entityId/relations',
    {
      schema: {
        tags: ['relations'],
        summary: "List an entity's relations, from and to it",
        description: ASPECT_DOC,
        operationId: 'relations.list',
        params: entityParams,
        response: { 200: list(RelationRead), ...problemResponses },
      },
    },
    async (request) => {
      await requireOwner(db, request.params.entityId);
      const viewer = visibleTo(actorOf(request));
      return { data: await listRelations(db, request.params.entityId, viewer) } as never;
    },
  );
  app.post(
    '/entities/:entityId/relations',
    {
      schema: {
        tags: ['relations'],
        summary: 'Relate this entity to another',
        description: `${ASPECT_DOC} "participant" goes from a character to an event; "related" links any two entities.`,
        operationId: 'relations.add',
        params: entityParams,
        body: RelationWrite,
        response: { 201: envelope(RelationRead), ...problemResponses },
      },
    },
    async (request, reply) => {
      const { entityId } = request.params;
      // Writers are editors, who see drafts at the other end too.
      const data = await write(request, reply, entityId, 'Add relation', async (tx) => {
        const relation = await addRelation(tx, entityId, request.body);
        // The insert returns its row; an empty result would be a database fault.
        if (!relation) throw new Error('Adding the relation returned no row.');
        const [withOther] = await withOtherEnds(tx, entityId, [relation], SEES_EVERYTHING);
        return withOther;
      });
      return reply.code(201).send({ data } as never);
    },
  );
  app.patch(
    '/entities/:entityId/relations/:relationId',
    {
      schema: {
        tags: ['relations'],
        summary: "Change a relation's role, order or spoiler flag",
        description: ASPECT_DOC,
        operationId: 'relations.update',
        params: relationParams,
        body: RelationPatch,
        response: { 200: envelope(RelationRead), ...problemResponses },
      },
    },
    async (request, reply) => {
      const { entityId, relationId } = request.params;
      const data = await write(request, reply, entityId, 'Edit relation', async (tx) => {
        const relation = await updateRelation(tx, relationId, request.body);
        const [withOther] = await withOtherEnds(tx, entityId, [relation], SEES_EVERYTHING);
        return withOther;
      });
      return { data } as never;
    },
  );
  app.delete(
    '/entities/:entityId/relations/:relationId',
    {
      schema: {
        tags: ['relations'],
        summary: 'Remove a relation',
        description: ASPECT_DOC,
        operationId: 'relations.remove',
        params: relationParams,
        response: deleted,
      },
    },
    async (request, reply) => {
      await write(request, reply, request.params.entityId, 'Remove relation', (tx) =>
        removeRelation(tx, request.params.relationId),
      );
      return reply.code(204).send(null);
    },
  );

  done();
};
