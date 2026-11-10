import { rt, type BatchRequest, type ViewGroup, type ViewGroupType } from '@ge/domain';

/**
 * Grouping objects (M4-T2, ux.md §5) as pure functions of the galaxy view's groups and group
 * types: the batches to send, and what to ask first. An object is in at most one group of each
 * type (data-model §3.3), so putting it in a group of a type it already has a group of is a
 * move: one batch removes it from the old group and adds it to the new one.
 */

type Group = Pick<ViewGroup, 'id' | 'namePlain' | 'groupTypeId' | 'members'>;

/** Selected objects already in another group of a type: from which group, and which ones. */
export interface Conflict {
  group: Group;
  objectIds: string[];
}

/** The groups of `groupTypeId` (except `exceptGroupId`) that hold any of these objects. */
export function conflictsFor(
  objectIds: readonly string[],
  groupTypeId: string,
  groups: readonly Group[],
  exceptGroupId?: string,
): Conflict[] {
  const wanted = new Set(objectIds);
  return groups.flatMap((group) => {
    if (group.groupTypeId !== groupTypeId || group.id === exceptGroupId) return [];
    const moving = group.members
      .map((member) => member.objectId as string)
      .filter((id) => wanted.has(id));
    return moving.length > 0 ? [{ group, objectIds: moving }] : [];
  });
}

const objects = (n: number) => `${n.toString()} ${n === 1 ? 'object' : 'objects'}`;

/** A list in words: "Helican", "Helican and Lyra", "Helican, Lyra and Ophidian". */
function inWords(names: readonly string[]): string {
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names.at(-1) ?? ''}`;
}

/** The question before a move (ux.md §5): "Move 2 objects from Helican to Ophidian?" */
export function moveQuestion(conflicts: readonly Conflict[], toName: string): string {
  const count = conflicts.reduce((sum, conflict) => sum + conflict.objectIds.length, 0);
  const from = inWords(conflicts.map((conflict) => conflict.group.namePlain));
  return `Move ${objects(count)} from ${from} to ${toName}?`;
}

/** Takes the conflicting objects out of their old groups: the first part of a move. */
function releaseOperations(conflicts: readonly Conflict[]): BatchRequest['operations'] {
  return conflicts.map((conflict) => ({
    op: 'removeMembers' as const,
    id: conflict.group.id,
    data: conflict.objectIds,
  }));
}

export interface NewGroup {
  mapId: string;
  name: string;
  groupTypeId: string;
  outlineColor: string;
  parentGroupId: string | null;
}

/**
 * Creating a group from a selection, as one batch and one undo step: create the group, take
 * the selection out of its other groups of this type, then add it (`$op:0` is the new group).
 */
export function groupRequest(
  group: NewGroup,
  objectIds: readonly string[],
  conflicts: readonly Conflict[],
): BatchRequest {
  return {
    description: `Group ${objects(objectIds.length)} as “${group.name}”`,
    operations: [
      {
        op: 'create',
        kind: 'group',
        mapId: group.mapId,
        data: {
          name: rt.plain(group.name),
          groupTypeId: group.groupTypeId,
          outlineColor: group.outlineColor,
          parentGroupId: group.parentGroupId,
        },
      },
      ...releaseOperations(conflicts),
      {
        op: 'addMembers',
        id: '$op:0',
        data: objectIds.map((objectId) => ({ objectId })),
      },
    ],
  };
}

/** Adding objects to an existing group ("Add to group ▸"), moving them from its siblings. */
export function addToGroupRequest(
  group: Group,
  objectIds: readonly string[],
  groups: readonly Group[],
): BatchRequest | null {
  const already = new Set(group.members.map((member) => member.objectId as string));
  const adding = objectIds.filter((id) => !already.has(id));
  if (adding.length === 0) return null;
  return {
    description: `Add ${objects(adding.length)} to “${group.namePlain}”`,
    operations: [
      ...releaseOperations(conflictsFor(adding, group.groupTypeId, groups, group.id)),
      { op: 'addMembers', id: group.id, data: adding.map((objectId) => ({ objectId })) },
    ],
  };
}

/** The layer ⌘/Ctrl + Shift + G works in: the one chosen, else the first in settings order. */
export function activeLayerOf(
  chosen: string | null,
  groupTypes: readonly Pick<ViewGroupType, 'layer' | 'sortKey'>[],
): string | null {
  if (chosen !== null && groupTypes.some((type) => type.layer === chosen)) return chosen;
  return groupTypes.toSorted((a, b) => a.sortKey - b.sortKey)[0]?.layer ?? null;
}

/**
 * Taking objects out of their groups in one layer (⌘/Ctrl + Shift + G, "Remove from group"):
 * every group of the layer's types that holds any of them. Null when none does.
 */
export function removeFromGroupsRequest(
  objectIds: readonly string[],
  layer: string,
  groups: readonly Group[],
  groupTypes: readonly Pick<ViewGroupType, 'id' | 'layer'>[],
): BatchRequest | null {
  const types = new Set<string>(
    groupTypes.filter((type) => type.layer === layer).map((type) => type.id),
  );
  const conflicts = [...types].flatMap((typeId) => conflictsFor(objectIds, typeId, groups));
  if (conflicts.length === 0) return null;
  const count = conflicts.reduce((sum, conflict) => sum + conflict.objectIds.length, 0);
  const from = inWords(conflicts.map((conflict) => conflict.group.namePlain));
  return {
    description: `Remove ${objects(count)} from ${from}`,
    operations: releaseOperations(conflicts),
  };
}

/** The groups a new group of this type may sit in: those of its type's parent type. */
export function parentChoices<G extends Pick<ViewGroup, 'groupTypeId'>>(
  groupTypeId: string,
  groups: readonly G[],
  groupTypes: readonly Pick<ViewGroupType, 'id' | 'parentGroupTypeId'>[],
): G[] {
  const parentType = groupTypes.find((type) => type.id === groupTypeId)?.parentGroupTypeId;
  if (!parentType) return [];
  return groups.filter((group) => group.groupTypeId === parentType);
}
