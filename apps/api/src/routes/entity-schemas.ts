import {
  entityKinds,
  ENTITY_STATUSES,
  FactRead,
  ImageRead,
  LinkRead,
  CitationRead,
  LocationRead,
  MemberRead,
  RelationRead,
  schemasFor,
  WaypointRead,
  type EntityKind,
} from '@ge/domain';
import { z } from 'zod';
import { redactedItem } from '../http/schemas.ts';

/** Route schemas derived from the entity-kind registry (architecture.md §3.1). */

const listOf = <T extends z.ZodType>(item: T) => z.array(z.union([item, redactedItem])).optional();

const responses = new Map<EntityKind, z.ZodType>();

/**
 * What a read returns: the kind's read schema, plus the aspects `include` asked for. Under
 * `spoilers=exclude` an aspect item may be a redacted placeholder instead. Built once per kind
 * and named (`CelestialObjectDetail`), so the OpenAPI document defines it once.
 */
export function entityResponse(kind: EntityKind) {
  const existing = responses.get(kind);
  if (existing) return existing as ReturnType<typeof buildResponse>;
  const schema = buildResponse(kind);
  const id = `${kind.replace(/(^|_)([a-z])/g, (_match, _sep, letter: string) => letter.toUpperCase())}Detail`;
  if (!z.globalRegistry.has(schema)) z.globalRegistry.add(schema, { id });
  responses.set(kind, schema);
  return schema;
}

function buildResponse(kind: EntityKind) {
  return schemasFor(kind).read.extend({
    facts: listOf(FactRead),
    images: listOf(ImageRead),
    links: listOf(LinkRead),
    citations: listOf(CitationRead),
    relations: listOf(RelationRead),
    location: z.union([LocationRead, redactedItem]).nullable().optional(),
    members: listOf(MemberRead),
    waypoints: listOf(WaypointRead),
  });
}

/**
 * List filters for a kind: its status, a name search, and every extension field that is an id
 * or a choice (`parentId`, `baseType`, `groupTypeId`, …). An id field that may be empty also
 * accepts "null", so `parentId=null` lists the top level.
 */
export function filterQuery(kind: EntityKind) {
  const filters: Record<string, z.ZodType> = {
    status: z.enum(ENTITY_STATUSES).optional().describe('Only entities with this status.'),
    q: z
      .string()
      .min(1)
      .max(200)
      .optional()
      .describe('Case-insensitive part of the plain-text name.'),
  };
  for (const [name, field] of Object.entries(entityKinds[kind].extension?.shape ?? {})) {
    let inner = field as z.ZodType;
    let nullable = false;
    while (inner instanceof z.ZodOptional || inner instanceof z.ZodNullable) {
      if (inner instanceof z.ZodNullable) nullable = true;
      inner = inner.unwrap() as z.ZodType;
    }
    if (inner instanceof z.ZodEnum) {
      filters[name] = inner.optional().describe(`Only entities with this ${name}.`);
    } else if (inner instanceof z.ZodUUID) {
      filters[name] = (nullable ? z.union([z.literal('null'), z.uuid()]) : z.uuid())
        .optional()
        .describe(
          nullable
            ? `Only entities with this ${name}; "null" for none.`
            : `Only entities with this ${name}.`,
        );
    }
  }
  return z.object(filters);
}

/** The extension filters a request used, with "null" turned into null. */
export function extensionFilters(
  kind: EntityKind,
  query: Record<string, unknown>,
): Record<string, unknown> {
  const fields = Object.keys(entityKinds[kind].extension?.shape ?? {});
  const where: Record<string, unknown> = {};
  for (const field of fields) {
    if (query[field] !== undefined) where[field] = query[field] === 'null' ? null : query[field];
  }
  return where;
}
