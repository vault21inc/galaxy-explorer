import { z } from 'zod';
import { Slug } from '../ids.ts';
import {
  CONFIG_RESOURCES,
  configResources,
  type ConfigResource,
  type ConfigResourceDef,
} from '../registry/config-resources.ts';
import { configSchemasFor, schemasFor } from '../registry/derive-schemas.ts';
import {
  ENTITY_KINDS,
  entityKinds,
  type EntityKind,
  type EntityKindDef,
} from '../registry/entity-kinds.ts';
import {
  AssetMetadata,
  CitationWrite,
  FactWrite,
  ImageWrite,
  LinkWrite,
  LocationWrite,
  MemberWrite,
  RelationWrite,
} from '../schemas/aspects.ts';
import { MapCreate, UniverseCreate } from '../schemas/containers.ts';
import { Ref, refTo, withRefs } from './refs.ts';

/**
 * The export format (M7-T4, architecture.md §5): a zip of JSON files, described here and
 * published as a JSON Schema at `/api/v1/export-schema.json`.
 *
 * - `manifest.json`: the format and its version, what made the file and when, and counts;
 * - `universe.json`: the universe's own fields, its assets, its settings rows and its
 *   universe-scoped entities (characters), and the relations between those;
 * - `maps/<slug>.json`: a map's own fields and its entities, each with its aspects, and the
 *   relations with an end in the map;
 * - `assets/<sha256>/<variant>.webp`: each asset's stored images.
 *
 * Records are the API's create bodies with ids swapped for references (refs.ts), so the format
 * follows the registries: a new kind, field or settings resource appears in it on its own.
 */

export const EXPORT_FORMAT = 'galaxy-explorer';
/** Raised when a change would make older files read differently. */
export const EXPORT_FORMAT_VERSION = 1;

/** The kinds a map file holds, and the kinds universe.json holds. */
export const MAP_KINDS = ENTITY_KINDS.filter((kind) => entityKinds[kind].scope === 'map');
export const UNIVERSE_KINDS = ENTITY_KINDS.filter((kind) => entityKinds[kind].scope === 'universe');

/** A settings resource's key in universe.json: `group_types` is `groupTypes`. */
export function configKeyOf(resource: ConfigResource): string {
  return resource.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
}

/** The field a settings row is referred to by: its name, or a field definition's key. */
export function configLabelOf(resource: ConfigResource): string {
  const key = configResources[resource].naturalKey;
  return key[key.length - 1] ?? 'name';
}

/**
 * The SHA-256 of an asset's upload, in hex. It also names the asset's folder in the zip, so it
 * is only ever letters, digits and hyphens (the demo seed's placeholders use short names).
 */
export const Sha256 = z
  .string()
  .regex(/^[a-z0-9][a-z0-9-]{0,127}$/, 'The SHA-256 of the upload, in lower-case hex.');

/** An asset's stored sizes; the files are `assets/<sha256>/<variant>.webp`. */
export const ASSET_VARIANTS = ['thumb', 'display', 'texture'] as const;
export type AssetVariantName = (typeof ASSET_VARIANTS)[number];

export function assetPath(sha256: string, variant: AssetVariantName): string {
  return `assets/${sha256}/${variant}.webp`;
}

const size = z.strictObject({ width: z.int().positive(), height: z.int().positive() });

export const ExportAsset = z.strictObject({
  /** Of the original upload: the asset's reference, and how imports find it already there. */
  sha256: Sha256,
  width: z.int().positive(),
  height: z.int().positive(),
  byteSize: z.int().nonnegative(),
  variants: z.strictObject({ thumb: size, display: size, texture: size.optional() }),
  originalFilename: z.string().max(300).nullable().optional(),
  ...AssetMetadata.shape,
});
export type ExportAsset = z.infer<typeof ExportAsset>;

/** The aspects are the same for every kind; these are their id fields. */
export const ExportFact = withRefs(
  FactWrite,
  { fieldDefinitionId: 'field_definitions' },
  { fieldDefinitionId: 'field' },
);
export const ExportImage = withRefs(ImageWrite, { assetId: 'asset' });
export const ExportMember = withRefs(MemberWrite, { objectId: 'entity' });
const locationOptions = LocationWrite.options.map((option) =>
  withRefs(option, { objectId: 'entity', placeId: 'entity' }),
);
export const ExportLocation = z.union(
  locationOptions as [z.ZodObject, z.ZodObject, ...z.ZodObject[]],
);
/** A relation, from one entry to another (data-model §3.4). */
export const ExportRelation = z.strictObject({
  from: refTo('entity'),
  ...withRefs(RelationWrite, { toEntityId: 'entity' }, { toEntityId: 'to' }).shape,
});

const listOf = (item: z.ZodType) => z.array(item).optional();

/** One entity of a kind: its create body with references, and its aspects. */
function entitySchema(kind: EntityKind): z.ZodObject {
  const def: EntityKindDef = entityKinds[kind];
  const aspects: Record<string, z.ZodType> = {};
  if (def.aspects.facts) aspects.facts = listOf(ExportFact);
  if (def.aspects.images) aspects.images = listOf(ExportImage);
  if (def.aspects.links) aspects.links = listOf(LinkWrite);
  aspects.citations = listOf(CitationWrite);
  if (def.aspects.location !== 'none') aspects.location = ExportLocation.nullable().optional();
  if (def.aspects.members) aspects.members = listOf(ExportMember);
  if (def.aspects.waypoints) aspects.waypoints = listOf(refTo('entity'));
  return z.strictObject({
    /**
     * How other records refer to this one when it has no `externalKey`, or when its key is
     * taken by another entry the references could mean.
     */
    ref: Ref.optional(),
    ...withRefs(schemasFor(kind).create, def.references ?? {}).shape,
    ...aspects,
  });
}

function configSchema(resource: ConfigResource): z.ZodObject {
  const def: ConfigResourceDef = configResources[resource];
  return z.strictObject({
    /** Only when two rows share a name (subtypes of different base types). */
    ref: Ref.optional(),
    ...withRefs(configSchemasFor(resource).create, def.references ?? {}).shape,
  });
}

export const ENTITY_RECORD_SCHEMAS = Object.fromEntries(
  ENTITY_KINDS.map((kind) => [kind, entitySchema(kind)]),
) as Record<EntityKind, z.ZodObject>;

export const CONFIG_RECORD_SCHEMAS = Object.fromEntries(
  CONFIG_RESOURCES.map((resource) => [resource, configSchema(resource)]),
) as Record<ConfigResource, z.ZodObject>;

const kindLists = (kinds: readonly EntityKind[]) =>
  Object.fromEntries(
    kinds.map((kind) => [entityKinds[kind].plural, listOf(ENTITY_RECORD_SCHEMAS[kind])]),
  );

export const ExportManifest = z.strictObject({
  format: z.literal(EXPORT_FORMAT),
  formatVersion: z.literal(EXPORT_FORMAT_VERSION),
  /** What wrote the file, such as "Galaxy Explorer 0.1.0". */
  generator: z.string().max(200),
  exportedAt: z.iso.datetime({ offset: true }),
  /** A whole universe, or one map with the universe's settings and characters. */
  scope: z.enum(['universe', 'map']),
  /** The map files, `maps/<slug>.json`, in the universe's order. */
  maps: z.array(Slug),
  /** Records per kind of record, for a reader's summary. */
  counts: z.record(z.string(), z.int().nonnegative()),
});
export type ExportManifest = z.infer<typeof ExportManifest>;

export const UniverseFile = z.strictObject({
  /** The universe's own fields; its slug is the importing universe's. */
  universe: z.strictObject(UniverseCreate.omit({ slug: true }).shape),
  assets: listOf(ExportAsset),
  ...Object.fromEntries(
    CONFIG_RESOURCES.map((resource) => [
      configKeyOf(resource),
      listOf(CONFIG_RECORD_SCHEMAS[resource]),
    ]),
  ),
  ...kindLists(UNIVERSE_KINDS),
  /** Between two universe-scoped entries. */
  relations: listOf(ExportRelation),
});

export const MapFile = z.strictObject({
  map: withRefs(MapCreate, { underlayAssetId: 'asset' }),
  ...kindLists(MAP_KINDS),
  /** With at least one end in this map; the other may be a universe-scoped entry. */
  relations: listOf(ExportRelation),
});

/** The files of an export, as one JSON Schema document (`/api/v1/export-schema.json`). */
export function exportJsonSchema(): Record<string, unknown> {
  const files = z
    .object({
      'manifest.json': ExportManifest,
      'universe.json': UniverseFile,
      'maps/<slug>.json': MapFile,
    })
    .describe(
      'A Galaxy Explorer export: a zip holding these JSON files, plus assets/<sha256>/<variant>.webp for each asset. ' +
        'Records refer to each other by reference, never by id: an entry by its externalKey or ref, a settings row by its name (a field definition by its key), an asset by its sha256.',
    );
  return z.toJSONSchema(files, { io: 'input', unrepresentable: 'any' });
}
