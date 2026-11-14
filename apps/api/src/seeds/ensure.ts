import { CONFIG_TABLES, schema, type Executor } from '@ge/db';
import type {
  ConfigResource,
  EntityKind,
  ImageWrite,
  LinkWrite,
  RelationWrite,
  MapCreate,
  UniverseCreate,
} from '@ge/domain';
import { and, eq } from 'drizzle-orm';
import type { z } from 'zod';
import {
  addLink,
  addRelation,
  attachImage,
  updateImage,
  updateLink,
  updateRelation,
} from '../services/aspects/content.ts';
import { createConfig, updateConfig } from '../services/config-service.ts';
import {
  createMap,
  createUniverse,
  INSTALLATION_OWN,
  updateMap,
  updateUniverse,
} from '../services/container-service.ts';
import { upsertEntityByKey, type EntityScope } from '../services/entity-service.ts';

/**
 * Idempotent writes for the seeds (M1-T11): each finds what's already there by a stable key
 * (slug, name, external key, URL) and updates it, or creates it. Running a seed twice changes no
 * ids and no content, only versions and update times.
 */

const { universes, maps, entityLinks, entityRelations, entityImages, assets } = schema;

export async function ensureUniverse(tx: Executor, values: z.input<typeof UniverseCreate>) {
  const [existing] = await tx.select().from(universes).where(eq(universes.slug, values.slug));
  // The seeds' universes are the installation's own: no owner, public (D-34).
  if (!existing) return createUniverse(tx, values, INSTALLATION_OWN);
  const { slug: _slug, ...rest } = values;
  return updateUniverse(tx, existing.id, { ...rest, version: existing.version });
}

export async function ensureMap(
  tx: Executor,
  universeId: string,
  values: z.input<typeof MapCreate>,
) {
  const [existing] = await tx
    .select()
    .from(maps)
    .where(and(eq(maps.universeId, universeId), eq(maps.slug, values.slug)));
  if (!existing) return createMap(tx, universeId, values);
  const { slug: _slug, ...rest } = values;
  return updateMap(tx, existing.id, { ...rest, version: existing.version });
}

/** A settings row found by its natural key: its name, or a field definition's key. */
export async function ensureConfig(
  tx: Executor,
  resource: ConfigResource,
  universeId: string,
  values: Record<string, unknown>,
): Promise<string> {
  const table = CONFIG_TABLES[resource] as typeof schema.groupTypes;
  const naturalKey = resource === 'field_definitions' ? schema.fieldDefinitions.key : table.name;
  const keyValue = (resource === 'field_definitions' ? values.key : values.name) as string;
  const [existing] = await tx
    .select({ id: table.id })
    .from(table)
    .where(and(eq(table.universeId, universeId), eq(naturalKey, keyValue)));
  if (!existing) return (await createConfig(tx, resource, universeId, values)).id;
  // A subtype's base type can't change, so it isn't sent again.
  const { baseType: _baseType, ...updatable } = values;
  return (
    await updateConfig(
      tx,
      resource,
      existing.id,
      resource === 'object_subtypes' ? updatable : values,
    )
  ).id;
}

/** An entity upserted by its external key; returns its id. */
export async function ensureEntity(
  tx: Executor,
  kind: EntityKind,
  scope: EntityScope,
  externalKey: string,
  values: Record<string, unknown>,
): Promise<string> {
  const { entity } = await upsertEntityByKey(tx, kind, scope, externalKey, values as never);
  return (entity as { id: string }).id;
}

export async function ensureLink(
  tx: Executor,
  entityId: string,
  values: z.input<typeof LinkWrite>,
) {
  const [existing] = await tx
    .select({ id: entityLinks.id })
    .from(entityLinks)
    .where(and(eq(entityLinks.entityId, entityId), eq(entityLinks.url, values.url)));
  return existing ? updateLink(tx, entityId, existing.id, values) : addLink(tx, entityId, values);
}

export async function ensureRelation(
  tx: Executor,
  fromEntityId: string,
  values: z.input<typeof RelationWrite>,
) {
  const [existing] = await tx
    .select({ id: entityRelations.id })
    .from(entityRelations)
    .where(
      and(
        eq(entityRelations.fromEntityId, fromEntityId),
        eq(entityRelations.toEntityId, values.toEntityId),
        eq(entityRelations.relationType, values.relationType),
      ),
    );
  if (!existing) return addRelation(tx, fromEntityId, values);
  const { role, isSpoiler, sortKey } = values;
  return updateRelation(tx, fromEntityId, existing.id, { role, isSpoiler, sortKey });
}

export async function ensureImage(
  tx: Executor,
  entityId: string,
  values: z.input<typeof ImageWrite>,
) {
  const role = values.role ?? 'gallery';
  const key = { entityId, assetId: values.assetId, role };
  const [existing] = await tx
    .select({ entityId: entityImages.entityId })
    .from(entityImages)
    .where(
      and(
        eq(entityImages.entityId, entityId),
        eq(entityImages.assetId, values.assetId),
        eq(entityImages.role, role),
      ),
    );
  return existing ? updateImage(tx, key, values) : attachImage(tx, entityId, values);
}

/**
 * A placeholder image record. Uploads arrive in M3, so the seed records an asset whose file
 * doesn't exist yet; it's enough to exercise images and their spoiler flags.
 */
export async function ensureAsset(
  tx: Executor,
  universeId: string,
  sha256: string,
  altText: string,
): Promise<string> {
  const [existing] = await tx
    .select({ id: assets.id })
    .from(assets)
    .where(and(eq(assets.universeId, universeId), eq(assets.sha256, sha256)));
  if (existing) return existing.id;
  const variant = { key: `seed/${sha256}.webp`, width: 512, height: 512 };
  const [row] = await tx
    .insert(assets)
    .values({
      universeId,
      sha256,
      mimeType: 'image/webp',
      width: 512,
      height: 512,
      byteSize: 0,
      variants: { thumb: variant, display: variant },
      altText,
      credit: 'Seed placeholder',
    })
    .returning({ id: assets.id });
  return row?.id ?? '';
}
