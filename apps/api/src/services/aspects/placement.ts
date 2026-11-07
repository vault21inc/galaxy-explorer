import { schema, type Executor } from '@ge/db';
import { LocationWrite, MemberWrite } from '@ge/domain';
import { and, eq, inArray, sql } from 'drizzle-orm';
import type { z } from 'zod';
import { NotFound, RuleViolation } from '../errors.ts';
import { checkLocation } from '../rules/aspects.ts';
import { checkMembership, loadGroup } from '../rules/groups.ts';
import { requireOwner } from './owner.ts';

/** Where places and events are, and which objects belong to which group. */

const { entityLocations, groupMembers } = schema;

// ---- location ---------------------------------------------------------------------------------

/** Puts a place or event somewhere, replacing its previous location. */
export async function setLocation(
  tx: Executor,
  entityId: string,
  input: z.input<typeof LocationWrite>,
) {
  const location = LocationWrite.parse(input);
  const owner = await requireOwner(tx, entityId);
  await checkLocation(tx, owner, location);
  if (owner.mapId === null) throw new RuleViolation('Only entities on a map can have a location.');
  // Every mode's columns, with the ones it doesn't use set to null (the table's check needs it).
  const row = {
    entityId,
    mapId: owner.mapId,
    mode: location.mode,
    objectId: 'objectId' in location ? (location.objectId ?? null) : null,
    placeId: 'placeId' in location ? location.placeId : null,
    latDeg: 'latDeg' in location ? location.latDeg : null,
    lonDeg: 'lonDeg' in location ? location.lonDeg : null,
    x: 'x' in location ? location.x : null,
    y: 'y' in location ? location.y : null,
    z: 'z' in location ? location.z : null,
    isSpoiler: location.isSpoiler ?? false,
  };
  const [saved] = await tx
    .insert(entityLocations)
    .values(row)
    .onConflictDoUpdate({ target: entityLocations.entityId, set: row })
    .returning();
  return saved;
}

/** Makes a place or event unplaced. */
export async function removeLocation(tx: Executor, entityId: string) {
  const rows = await tx
    .delete(entityLocations)
    .where(eq(entityLocations.entityId, entityId))
    .returning();
  if (rows.length === 0) throw new NotFound('location', entityId);
}

// ---- group members ----------------------------------------------------------------------------

async function requireGroup(tx: Executor, groupId: string) {
  const owner = await requireOwner(tx, groupId);
  if (owner.kind !== 'group') throw new NotFound('group', groupId);
  return { owner, group: await loadGroup(tx, groupId, owner, '/groupId') };
}

/** Adds objects to a group; ones already in it keep their membership, with the new flag. */
export async function addMembers(
  tx: Executor,
  groupId: string,
  input: z.input<typeof MemberWrite>[],
) {
  const members = input.map((member) => MemberWrite.parse(member));
  const { owner, group } = await requireGroup(tx, groupId);
  for (const [index, member] of members.entries()) {
    await checkMembership(tx, owner, group, member.objectId, `/${String(index)}/objectId`);
  }
  if (members.length === 0) return [];
  return tx
    .insert(groupMembers)
    .values(
      members.map((member) => ({
        groupId,
        groupTypeId: group.groupTypeId,
        mapId: group.mapId,
        objectId: member.objectId,
        isSpoiler: member.isSpoiler ?? false,
      })),
    )
    .onConflictDoUpdate({
      target: [groupMembers.groupId, groupMembers.objectId],
      // `excluded` is the row that was about to be inserted: take its flag.
      set: { isSpoiler: sql`excluded.is_spoiler` },
    })
    .returning();
}

export async function removeMembers(tx: Executor, groupId: string, objectIds: string[]) {
  await requireGroup(tx, groupId);
  if (objectIds.length === 0) return;
  await tx
    .delete(groupMembers)
    .where(and(eq(groupMembers.groupId, groupId), inArray(groupMembers.objectId, objectIds)));
}

/** Replaces a group's members with exactly these. */
export async function setMembers(
  tx: Executor,
  groupId: string,
  input: z.input<typeof MemberWrite>[],
) {
  await requireGroup(tx, groupId);
  await tx.delete(groupMembers).where(eq(groupMembers.groupId, groupId));
  return addMembers(tx, groupId, input);
}
