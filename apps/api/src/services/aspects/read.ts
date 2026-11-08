import { schema, type Executor } from '@ge/db';
import { asc, eq, or } from 'drizzle-orm';

/** The aspect lists, as the API returns them (the Read schemas in @ge/domain). */

const { entityImages, entityLinks, entityLocations, entityRelations, fieldValues, groupMembers } =
  schema;

export function listFacts(ex: Executor, entityId: string) {
  return ex
    .select()
    .from(fieldValues)
    .where(eq(fieldValues.entityId, entityId))
    .orderBy(asc(fieldValues.sortKey));
}

export function listImages(ex: Executor, entityId: string) {
  return ex
    .select()
    .from(entityImages)
    .where(eq(entityImages.entityId, entityId))
    .orderBy(asc(entityImages.sortKey));
}

export function listLinks(ex: Executor, entityId: string) {
  return ex
    .select()
    .from(entityLinks)
    .where(eq(entityLinks.entityId, entityId))
    .orderBy(asc(entityLinks.sortKey));
}

/** Relations from or to the entity: a character's events, an event's people. */
export async function listRelations(ex: Executor, entityId: string) {
  const rows = await ex
    .select()
    .from(entityRelations)
    .where(or(eq(entityRelations.fromEntityId, entityId), eq(entityRelations.toEntityId, entityId)))
    .orderBy(asc(entityRelations.sortKey));
  return rows.map(({ universeId: _universeId, createdAt: _createdAt, ...relation }) => relation);
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
