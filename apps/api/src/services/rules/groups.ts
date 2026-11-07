import { schema, type Executor } from '@ge/db';
import { and, eq, inArray, ne } from 'drizzle-orm';
import { RuleViolation } from '../errors.ts';
import { requireInUniverse, requireReferencedObject, type Scope } from '../lookup.ts';

const { entities, groupMembers, groupTypes, objectGroups } = schema;

export interface GroupState {
  id?: string;
  groupTypeId: string;
  parentGroupId: string | null;
}

/**
 * Rules for groups (T5, U6):
 * - the group type belongs to this universe;
 * - group types nest: a Sub-sector's parent group must be a Sector. A type with no parent type
 *   makes top-level groups only;
 * - a group can't end up inside itself;
 * - changing a group's type keeps its members in one group per type, and its child groups
 *   nested correctly.
 */
export async function checkGroup(ex: Executor, scope: Scope, group: GroupState): Promise<void> {
  const type = requireInUniverse(
    await ex.select().from(groupTypes).where(eq(groupTypes.id, group.groupTypeId)),
    scope,
    '/groupTypeId',
    'group type',
  );

  if (group.parentGroupId !== null) {
    const parent = await loadGroup(ex, group.parentGroupId, scope, '/parentGroupId');
    if (type.parentGroupTypeId === null) {
      throw new RuleViolation(
        `A ${type.name} is a top-level group type, so it can't have a parent group.`,
        '/parentGroupId',
      );
    }
    if (parent.groupTypeId !== type.parentGroupTypeId) {
      const [expected] = await ex
        .select()
        .from(groupTypes)
        .where(eq(groupTypes.id, type.parentGroupTypeId));
      throw new RuleViolation(
        `A ${type.name}'s parent group must be a ${expected?.name ?? 'group of its parent type'}.`,
        '/parentGroupId',
      );
    }
    if (
      group.id !== undefined &&
      (await groupAncestorIds(ex, group.parentGroupId)).includes(group.id)
    ) {
      throw new RuleViolation(
        "A group can't be placed inside itself or its own subgroups.",
        '/parentGroupId',
      );
    }
  }

  if (group.id !== undefined) {
    const [current] = await ex
      .select()
      .from(objectGroups)
      .where(eq(objectGroups.entityId, group.id));
    if (current && current.groupTypeId !== group.groupTypeId) {
      await checkTypeChange(ex, group.id, type);
    }
  }
}

async function checkTypeChange(
  ex: Executor,
  groupId: string,
  newType: typeof groupTypes.$inferSelect,
): Promise<void> {
  const members = await ex.select().from(groupMembers).where(eq(groupMembers.groupId, groupId));
  if (members.length > 0) {
    const clash = await ex
      .select({ objectId: groupMembers.objectId })
      .from(groupMembers)
      .where(
        and(
          eq(groupMembers.groupTypeId, newType.id),
          inArray(
            groupMembers.objectId,
            members.map((member) => member.objectId),
          ),
          ne(groupMembers.groupId, groupId),
        ),
      );
    if (clash.length > 0) {
      throw new RuleViolation(
        `Some members are already in another ${newType.name}, and an object can be in only one group of each type.`,
        '/groupTypeId',
      );
    }
  }
  const children = await ex
    .select({ groupTypeId: objectGroups.groupTypeId })
    .from(objectGroups)
    .where(eq(objectGroups.parentGroupId, groupId));
  for (const child of children) {
    const [childType] = await ex
      .select()
      .from(groupTypes)
      .where(eq(groupTypes.id, child.groupTypeId));
    if (childType?.parentGroupTypeId !== newType.id) {
      throw new RuleViolation(
        `A subgroup of this group can't be inside a ${newType.name}.`,
        '/groupTypeId',
      );
    }
  }
}

/** Loads a group a field refers to, on the same map. */
export async function loadGroup(ex: Executor, groupId: string, scope: Scope, path: string) {
  const [row] = await ex
    .select({ group: objectGroups, entity: entities })
    .from(objectGroups)
    .innerJoin(entities, eq(entities.id, objectGroups.entityId))
    .where(eq(objectGroups.entityId, groupId));
  if (row?.entity.universeId !== scope.universeId || row.entity.mapId !== scope.mapId) {
    throw new RuleViolation(`${path} doesn't name a group on this map.`, path);
  }
  return { ...row.group, namePlain: row.entity.namePlain };
}

async function groupAncestorIds(ex: Executor, groupId: string): Promise<string[]> {
  const ids: string[] = [];
  let current: string | null = groupId;
  while (current !== null && !ids.includes(current)) {
    ids.push(current);
    const [row] = await ex
      .select({ parentGroupId: objectGroups.parentGroupId })
      .from(objectGroups)
      .where(eq(objectGroups.entityId, current));
    current = row?.parentGroupId ?? null;
  }
  return ids;
}

/**
 * Rules for adding an object to a group:
 * - the object is a top-level object on the group's map (members are what the galaxy view
 *   shows; a group's outline also covers its subgroups' members);
 * - an object is in at most one group of each type. The message names the group it's in now.
 */
export async function checkMembership(
  ex: Executor,
  scope: Scope,
  group: { entityId: string; groupTypeId: string },
  objectId: string,
  path: string,
): Promise<void> {
  const object = await requireReferencedObject(ex, objectId, scope, path);
  if (object.parentId !== null) {
    throw new RuleViolation(
      `${object.namePlain} isn't a top-level object, so it can't be a group member.`,
      path,
    );
  }
  const [existing] = await ex
    .select({ groupId: groupMembers.groupId, name: entities.namePlain, typeName: groupTypes.name })
    .from(groupMembers)
    .innerJoin(entities, eq(entities.id, groupMembers.groupId))
    .innerJoin(groupTypes, eq(groupTypes.id, groupMembers.groupTypeId))
    .where(
      and(eq(groupMembers.objectId, objectId), eq(groupMembers.groupTypeId, group.groupTypeId)),
    );
  if (existing && existing.groupId !== group.entityId) {
    throw new RuleViolation(
      `${object.namePlain} is already in ${existing.name}, another ${existing.typeName}. An object can be in only one group of each type; remove it from ${existing.name} first.`,
      path,
    );
  }
}
