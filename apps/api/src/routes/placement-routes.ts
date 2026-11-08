import type { Database } from '@ge/db';
import { LocationRead, LocationWrite, MemberRead, MemberWrite } from '@ge/domain';
import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { envelope, problemResponses } from '../http/schemas.ts';
import { requireOwner } from '../services/aspects/owner.ts';
import {
  addMembers,
  removeLocation,
  removeMembers,
  setLocation,
  setMembers,
} from '../services/aspects/placement.ts';
import { getLocation, listMembers } from '../services/aspects/read.ts';
import { NotFound } from '../services/errors.ts';
import { ASPECT_DOC, aspectWriter, deleted, entityParams, list } from './aspect-helpers.ts';

/** Where places and events are, and which objects belong to which group. */

const LOCATION_DOC = `${ASPECT_DOC} Modes: "surface" (on a planet or moon at latDeg/lonDeg), "object" (at an object), "space" (x, y, z in a system's frame, or the galaxy's without objectId), "place" (at another place).`;
const MEMBERS_DOC =
  "Members are top-level objects on the group's map; an object is in at most one group of each type. Each change is one batch, returned in X-GE-Batch-Id.";
const groupParams = z.object({ groupId: z.uuid() });
const MembersBody = z.strictObject({ members: z.array(MemberWrite).min(1).max(1_000) });

export const placementRoutes: FastifyPluginCallbackZod<{ db: Database }> = (app, { db }, done) => {
  const write = aspectWriter(db);

  // ---- location ----
  app.get(
    '/entities/:entityId/location',
    {
      schema: {
        tags: ['locations'],
        summary: 'Where a place or event is',
        description: LOCATION_DOC,
        operationId: 'location.get',
        params: entityParams,
        response: { 200: envelope(LocationRead.nullable()), ...problemResponses },
      },
    },
    async (request) => {
      await requireOwner(db, request.params.entityId);
      return { data: await getLocation(db, request.params.entityId) } as never;
    },
  );

  app.put(
    '/entities/:entityId/location',
    {
      schema: {
        tags: ['locations'],
        summary: 'Place a place or event',
        description: LOCATION_DOC,
        operationId: 'location.set',
        params: entityParams,
        body: LocationWrite,
        response: { 200: envelope(LocationRead), ...problemResponses },
      },
    },
    async (request, reply) => {
      const { entityId } = request.params;
      const data = await write(request, reply, entityId, 'Set location', (tx) =>
        setLocation(tx, entityId, request.body),
      );
      return { data } as never;
    },
  );

  app.delete(
    '/entities/:entityId/location',
    {
      schema: {
        tags: ['locations'],
        summary: 'Make a place or event unplaced',
        description: LOCATION_DOC,
        operationId: 'location.remove',
        params: entityParams,
        response: deleted,
      },
    },
    async (request, reply) => {
      const { entityId } = request.params;
      await write(request, reply, entityId, 'Remove location', (tx) =>
        removeLocation(tx, entityId),
      );
      return reply.code(204).send(null);
    },
  );

  // ---- group members ----
  const requireGroup = async (groupId: string) => {
    const owner = await requireOwner(db, groupId);
    if (owner.kind !== 'group') throw new NotFound('group', groupId);
  };

  app.get(
    '/groups/:groupId/members',
    {
      schema: {
        tags: ['groups'],
        summary: "List a group's members",
        description: MEMBERS_DOC,
        operationId: 'groups.members.list',
        params: groupParams,
        response: { 200: list(MemberRead), ...problemResponses },
      },
    },
    async (request) => {
      await requireGroup(request.params.groupId);
      return { data: await listMembers(db, request.params.groupId) } as never;
    },
  );

  app.put(
    '/groups/:groupId/members',
    {
      schema: {
        tags: ['groups'],
        summary: "Replace a group's members",
        description: MEMBERS_DOC,
        operationId: 'groups.members.set',
        params: groupParams,
        body: z.strictObject({ members: z.array(MemberWrite).max(1_000) }),
        response: { 200: list(MemberRead), ...problemResponses },
      },
    },
    async (request, reply) => {
      const { groupId } = request.params;
      await requireGroup(groupId);
      await write(request, reply, groupId, 'Set group members', (tx) =>
        setMembers(tx, groupId, request.body.members),
      );
      return { data: await listMembers(db, groupId) } as never;
    },
  );

  app.post(
    '/groups/:groupId/members',
    {
      schema: {
        tags: ['groups'],
        summary: 'Add objects to a group',
        description: MEMBERS_DOC,
        operationId: 'groups.members.add',
        params: groupParams,
        body: MembersBody,
        response: { 200: list(MemberRead), ...problemResponses },
      },
    },
    async (request, reply) => {
      const { groupId } = request.params;
      await requireGroup(groupId);
      await write(request, reply, groupId, 'Add group members', (tx) =>
        addMembers(tx, groupId, request.body.members),
      );
      return { data: await listMembers(db, groupId) } as never;
    },
  );

  app.delete(
    '/groups/:groupId/members',
    {
      schema: {
        tags: ['groups'],
        summary: 'Remove objects from a group',
        description: MEMBERS_DOC,
        operationId: 'groups.members.remove',
        params: groupParams,
        body: z.strictObject({ objectIds: z.array(z.uuid()).min(1).max(1_000) }),
        response: deleted,
      },
    },
    async (request, reply) => {
      const { groupId } = request.params;
      await requireGroup(groupId);
      await write(request, reply, groupId, 'Remove group members', (tx) =>
        removeMembers(tx, groupId, request.body.objectIds),
      );
      return reply.code(204).send(null);
    },
  );

  done();
};
