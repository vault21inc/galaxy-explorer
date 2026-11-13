import { z } from 'zod';
import { ENTITY_KINDS } from '../registry/entity-kinds.ts';

/**
 * `POST /api/v1/batch` (M1-T7, architecture.md §5): many operations in one transaction and one
 * change batch, so the whole request is one undo step. The editor saves multi-object drags this
 * way, and LLM agents build whole systems in one call.
 *
 * An operation can refer to an entity created by an earlier operation in the same request as
 * `"$op:N"` (N counts from 0), anywhere an id goes: `id`, `mapId`, or inside `data`.
 */

/** The largest number of operations in one batch request. */
export const MAX_BATCH_OPERATIONS = 1_000;

/** Matches a temporary reference, `"$op:3"`. */
export const OPERATION_REFERENCE = /^\$op:(\d+)$/;

/** An id, or a temporary reference to an earlier operation's result. */
const Ref = z
  .union([z.uuid(), z.string().regex(OPERATION_REFERENCE)])
  .describe('An id, or "$op:N" for the entity created by operation N of this request.');

/**
 * `data` is the same body as the matching single-resource route, which validates it once the
 * references are resolved, so here it's any object.
 */
const Data = z.record(z.string(), z.unknown());
const kind = z.enum(ENTITY_KINDS);
const version = z.int().positive();
/** Where a new entity goes: `mapId` for map-scoped kinds, `universeId` for characters. */
const scope = { mapId: Ref.optional(), universeId: Ref.optional() };

export const BatchOperation = z.discriminatedUnion('op', [
  z.strictObject({ op: z.literal('create'), kind, ...scope, data: Data }),
  z.strictObject({ op: z.literal('update'), kind, id: Ref, version, data: Data }),
  z.strictObject({ op: z.literal('delete'), kind, id: Ref, version }),
  z.strictObject({
    op: z.literal('upsert'),
    kind,
    externalKey: z.string().min(1).max(200),
    ...scope,
    data: Data,
  }),
  z.strictObject({ op: z.literal('setLocation'), id: Ref, data: Data }),
  z.strictObject({
    op: z.literal('addMembers'),
    id: Ref,
    data: z.array(Data).min(1).max(MAX_BATCH_OPERATIONS),
  }),
  z.strictObject({
    op: z.literal('removeMembers'),
    id: Ref,
    data: z.array(Ref).min(1).max(MAX_BATCH_OPERATIONS),
  }),
  /** A route's waypoints, replaced by these objects in order (M4-T7). */
  z.strictObject({
    op: z.literal('setWaypoints'),
    id: Ref,
    data: z.array(Ref).max(MAX_BATCH_OPERATIONS),
  }),
  z.strictObject({ op: z.literal('setFacts'), id: Ref, data: z.array(Data).min(1).max(100) }),
  z.strictObject({ op: z.literal('addLink'), id: Ref, data: Data }),
  z.strictObject({ op: z.literal('addRelation'), id: Ref, data: Data }),
  /** Where filled-in content came from (M7-T3): the same body as POST /entities/{id}/citations. */
  z.strictObject({ op: z.literal('addCitation'), id: Ref, data: Data }),
]);
export type BatchOperation = z.infer<typeof BatchOperation>;

export const BatchRequest = z.strictObject({
  /** Shown in the history panel, such as "Moved 12 objects" or "MCP: build Gudrun system". */
  description: z.string().trim().min(1).max(200),
  /** Run everything, report the results and the impact, then roll it all back. */
  dryRun: z.boolean().optional(),
  operations: z.array(BatchOperation).min(1).max(MAX_BATCH_OPERATIONS),
});
export type BatchRequest = z.infer<typeof BatchRequest>;
