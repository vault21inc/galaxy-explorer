import { schema, type Executor } from '@ge/db';
import { and, asc, eq, inArray, or } from 'drizzle-orm';
import { assetsById } from '../asset-service.ts';
import { entityVisible, type Viewer } from '../visibility.ts';

/** The aspect lists, as the API returns them (the Read schemas in @ge/domain). */

const {
  entities,
  entityImages,
  entityLinks,
  entityLocations,
  entityRelations,
  fieldValues,
  groupMembers,
} = schema;

export function listFacts(ex: Executor, entityId: string) {
  return ex
    .select()
    .from(fieldValues)
    .where(eq(fieldValues.entityId, entityId))
    .orderBy(asc(fieldValues.sortKey));
}

export async function listImages(ex: Executor, entityId: string) {
  const rows = await ex
    .select()
    .from(entityImages)
    .where(eq(entityImages.entityId, entityId))
    .orderBy(asc(entityImages.sortKey));
  return withAssets(ex, rows);
}

/**
 * Adds each image's asset: its URLs, size and credit (ImageRead.asset), so a reader draws the
 * gallery from one response.
 */
export async function withAssets<Row extends { assetId: string }>(
  ex: Executor,
  rows: readonly Row[],
) {
  const assets = await assetsById(
    ex,
    rows.map((row) => row.assetId),
  );
  return rows.map((row) => {
    const asset = assets.get(row.assetId);
    // The foreign key keeps every image's asset; a missing one is a bug, not a reader's error.
    if (!asset) throw new Error(`Image ${row.assetId} has no asset row.`);
    const { width, height, altText, credit, sourceUrl, license, urls } = asset;
    return { ...row, asset: { width, height, altText, credit, sourceUrl, license, urls } };
  });
}

export function listLinks(ex: Executor, entityId: string) {
  return ex
    .select()
    .from(entityLinks)
    .where(eq(entityLinks.entityId, entityId))
    .orderBy(asc(entityLinks.sortKey));
}

/** Relations from or to the entity: a character's events, an event's people. */
export async function listRelations(ex: Executor, entityId: string, viewer: Viewer) {
  const rows = await ex
    .select()
    .from(entityRelations)
    .where(or(eq(entityRelations.fromEntityId, entityId), eq(entityRelations.toEntityId, entityId)))
    .orderBy(asc(entityRelations.sortKey));
  const relations = rows.map(
    ({ universeId: _universeId, createdAt: _createdAt, ...relation }) => relation,
  );
  return withOtherEnds(ex, entityId, relations, viewer);
}

interface RelationRow {
  fromEntityId: string;
  toEntityId: string;
}

/**
 * Adds each relation's other end, seen from `entityId`: its kind and name, so readers can name
 * and link it (RelationRead.other). A relation whose other end the viewer can't see (a draft,
 * for readers) is left out, so drafts never leak through their relations.
 */
export async function withOtherEnds<R extends RelationRow>(
  ex: Executor,
  entityId: string,
  relations: readonly R[],
  viewer: Viewer,
) {
  const otherId = (relation: R) =>
    relation.fromEntityId === entityId ? relation.toEntityId : relation.fromEntityId;
  const ids = [...new Set(relations.map(otherId))];
  if (ids.length === 0) return [];
  const others = await ex
    .select({
      id: entities.id,
      kind: entities.kind,
      namePlain: entities.namePlain,
      isSpoiler: entities.isSpoiler,
      name: entities.name,
    })
    .from(entities)
    .where(and(inArray(entities.id, ids), entityVisible(viewer)));
  const byId = new Map(
    others.map(({ name, ...other }) => [other.id, { ...other, nameSpoiler: name.spoiler }]),
  );
  return relations.flatMap((relation) => {
    const other = byId.get(otherId(relation));
    return other ? [{ ...relation, other }] : [];
  });
}

export async function getLocation(ex: Executor, entityId: string) {
  const [row] = await ex
    .select()
    .from(entityLocations)
    .where(eq(entityLocations.entityId, entityId));
  if (!row) return null;
  const { mapId: _mapId, ...location } = row;
  return location;
}

export function listMembers(ex: Executor, groupId: string) {
  return ex
    .select({ objectId: groupMembers.objectId, isSpoiler: groupMembers.isSpoiler })
    .from(groupMembers)
    .where(eq(groupMembers.groupId, groupId))
    .orderBy(asc(groupMembers.objectId));
}
