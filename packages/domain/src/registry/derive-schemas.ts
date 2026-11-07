import { z } from 'zod';
import { Uuid } from '../ids.ts';
import { RichText } from '../richtext/schema.ts';
import { configResources, type ConfigResource } from './config-resources.ts';
import { entityKinds, type EntityKind } from './entity-kinds.ts';

/**
 * Create, update and read schemas, derived from the registries (architecture.md §3.1) so
 * routes, forms, the API client and tests all use one definition per kind:
 *
 * - **create:** the writable fields. Unknown fields are rejected, so a typo from an API client
 *   is an error rather than silently ignored.
 * - **update:** every writable field optional, plus the `version` being edited (a stale
 *   version is a 409 conflict, architecture.md §5). Config resources have no version.
 * - **read:** every writable field present (filled with database defaults), plus the
 *   server-side fields: id, scope ids, `namePlain`, `version` and timestamps.
 */

export const ENTITY_STATUSES = ['draft', 'published'] as const;

/** The fields every entity kind shares (data-model §3.2). */
const entityWritableShape = {
  name: RichText,
  /** One or two sentences. */
  summary: RichText.nullable().optional(),
  description: RichText.nullable().optional(),
  /** The whole entity is a potential spoiler. Default false. */
  isSpoiler: z.boolean().optional(),
  /** Default 'published' (data-model §8). */
  status: z.enum(ENTITY_STATUSES).optional(),
  /** A stable key for imports and LLM agents, unique per map (or universe). */
  externalKey: z.string().trim().min(1).max(200).nullable().optional(),
};

const version = z.int().positive();
const timestamp = z.iso.datetime({ offset: true });

// K and Scope appear once in the signature, but they shape the inferred return type: the read
// schema's `kind` literal and whether `mapId` is a UUID or null.
// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
function deriveEntity<K extends string, Scope extends 'map' | 'universe', S extends z.ZodRawShape>(
  kind: K,
  scope: Scope,
  extensionShape: S,
) {
  const writable = { ...entityWritableShape, ...extensionShape };
  const create = z.strictObject(writable);
  const update = create.partial().extend({ version });
  const read = z
    .object(writable)
    .required()
    .extend({
      id: Uuid,
      kind: z.literal(kind),
      universeId: Uuid,
      /** Null for universe-scoped kinds such as characters. */
      mapId: (scope === 'map' ? Uuid : z.null()) as Scope extends 'map' ? typeof Uuid : z.ZodNull,
      /** The plain text of `name`, for labels, sorting and breadcrumbs. */
      namePlain: z.string(),
      clonedFromEntityId: Uuid.nullable(),
      version,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
  return { create, update, read };
}

function deriveConfig<S extends z.ZodRawShape>(shape: S) {
  const create = z.strictObject(shape);
  const update = create.partial();
  const read = z.object(shape).required().extend({ id: Uuid, universeId: Uuid });
  return { create, update, read };
}

type KindDef<K extends EntityKind> = (typeof entityKinds)[K];
/** The extension's fields, or no fields for kinds without an extension table. */
type ExtensionShape<K extends EntityKind> =
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- "no extra fields" is exactly {}
  KindDef<K>['extension'] extends z.ZodObject<infer S> ? S : {};
export type EntitySchemas<K extends EntityKind> = ReturnType<
  typeof deriveEntity<K, KindDef<K>['scope'], ExtensionShape<K>>
>;
export type ConfigSchemas<R extends ConfigResource> = ReturnType<
  typeof deriveConfig<(typeof configResources)[R]['schema']['shape']>
>;

const entitySchemas = Object.fromEntries(
  Object.entries(entityKinds).map(([kind, def]) => [
    kind,
    deriveEntity(kind, def.scope, def.extension?.shape ?? {}),
  ]),
) as { [K in EntityKind]: EntitySchemas<K> };

const configSchemas = Object.fromEntries(
  Object.entries(configResources).map(([name, def]) => [name, deriveConfig(def.schema.shape)]),
) as { [R in ConfigResource]: ConfigSchemas<R> };

/** The create, update and read schemas of an entity kind. */
export function schemasFor<K extends EntityKind>(kind: K): EntitySchemas<K> {
  return entitySchemas[kind];
}

/** The create, update and read schemas of a config resource. */
export function configSchemasFor<R extends ConfigResource>(resource: R): ConfigSchemas<R> {
  return configSchemas[resource];
}
