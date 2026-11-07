import { schema, type Executor } from '@ge/db';
import { FactWrite, ImageWrite, LinkWrite, RelationWrite } from '@ge/domain';
import { and, eq } from 'drizzle-orm';
import type { z } from 'zod';
import { NotFound } from '../errors.ts';
import { checkAspectAllowed, checkFact, checkImage, checkRelation } from '../rules/aspects.ts';
import { sanitizeRichTextFields } from '../sanitize.ts';
import { requireOwner } from './owner.ts';

/**
 * Images, links, facts and relations: independent rows attached to an entity (data-model §3.4).
 * They have no version; the last write wins (architecture.md §4).
 */

const { entityImages, entityLinks, entityRelations, fieldValues } = schema;

// ---- images -----------------------------------------------------------------------------------

export async function attachImage(
  tx: Executor,
  entityId: string,
  input: z.input<typeof ImageWrite>,
) {
  const image = sanitizeRichTextFields(ImageWrite, ImageWrite.parse(input));
  const owner = await requireOwner(tx, entityId);
  await checkImage(tx, owner, image.assetId);
  const [row] = await tx
    .insert(entityImages)
    .values({ ...image, entityId })
    .returning();
  return row;
}

export async function updateImage(
  tx: Executor,
  key: { entityId: string; assetId: string; role: string },
  input: z.input<ReturnType<typeof ImageWrite.partial>>,
) {
  const patch = sanitizeRichTextFields(ImageWrite, ImageWrite.partial().parse(input));
  if (patch.assetId !== undefined && patch.assetId !== key.assetId) {
    await checkImage(tx, await requireOwner(tx, key.entityId), patch.assetId);
  }
  const [row] = await tx.update(entityImages).set(patch).where(imageKey(key)).returning();
  if (!row) throw new NotFound('image', `${key.entityId}/${key.assetId}/${key.role}`);
  return row;
}

export async function detachImage(
  tx: Executor,
  key: { entityId: string; assetId: string; role: string },
) {
  const rows = await tx.delete(entityImages).where(imageKey(key)).returning();
  if (rows.length === 0) throw new NotFound('image', `${key.entityId}/${key.assetId}/${key.role}`);
}

const imageKey = (key: { entityId: string; assetId: string; role: string }) =>
  and(
    eq(entityImages.entityId, key.entityId),
    eq(entityImages.assetId, key.assetId),
    eq(entityImages.role, key.role),
  );

// ---- links ------------------------------------------------------------------------------------

export async function addLink(tx: Executor, entityId: string, input: z.input<typeof LinkWrite>) {
  const link = LinkWrite.parse(input);
  checkAspectAllowed(await requireOwner(tx, entityId), 'links');
  const [row] = await tx
    .insert(entityLinks)
    .values({ ...link, entityId })
    .returning();
  return row;
}

export async function updateLink(
  tx: Executor,
  linkId: string,
  input: z.input<ReturnType<typeof LinkWrite.partial>>,
) {
  const [row] = await tx
    .update(entityLinks)
    .set(LinkWrite.partial().parse(input))
    .where(eq(entityLinks.id, linkId))
    .returning();
  if (!row) throw new NotFound('link', linkId);
  return row;
}

export async function removeLink(tx: Executor, linkId: string) {
  const rows = await tx.delete(entityLinks).where(eq(entityLinks.id, linkId)).returning();
  if (rows.length === 0) throw new NotFound('link', linkId);
}

// ---- facts ------------------------------------------------------------------------------------

/** Sets one fact, replacing any earlier value for the same field. */
export async function setFact(tx: Executor, entityId: string, input: z.input<typeof FactWrite>) {
  const fact = sanitizeRichTextFields(FactWrite, FactWrite.parse(input));
  await checkFact(tx, await requireOwner(tx, entityId), fact.fieldDefinitionId, fact.value);
  const [row] = await tx
    .insert(fieldValues)
    .values({ ...fact, entityId })
    .onConflictDoUpdate({
      target: [fieldValues.entityId, fieldValues.fieldDefinitionId],
      set: { value: fact.value, isSpoiler: fact.isSpoiler ?? false, sortKey: fact.sortKey ?? null },
    })
    .returning();
  return row;
}

export async function removeFact(tx: Executor, entityId: string, fieldDefinitionId: string) {
  const rows = await tx
    .delete(fieldValues)
    .where(
      and(eq(fieldValues.entityId, entityId), eq(fieldValues.fieldDefinitionId, fieldDefinitionId)),
    )
    .returning();
  if (rows.length === 0) throw new NotFound('fact', `${entityId}/${fieldDefinitionId}`);
}

// ---- relations --------------------------------------------------------------------------------

/** Relates `fromEntityId` to `input.toEntityId`, such as a character to an event. */
export async function addRelation(
  tx: Executor,
  fromEntityId: string,
  input: z.input<typeof RelationWrite>,
) {
  const relation = sanitizeRichTextFields(RelationWrite, RelationWrite.parse(input));
  const from = await requireOwner(tx, fromEntityId);
  await checkRelation(tx, from, relation.relationType, relation.toEntityId);
  const [row] = await tx
    .insert(entityRelations)
    .values({ ...relation, fromEntityId, universeId: from.universeId })
    .returning();
  return row;
}

const RelationPatch = RelationWrite.pick({ role: true, isSpoiler: true, sortKey: true }).partial();

/** Changes a relation's role, spoiler flag or order; to change its ends, remove and add it. */
export async function updateRelation(
  tx: Executor,
  relationId: string,
  input: z.input<typeof RelationPatch>,
) {
  const patch = sanitizeRichTextFields(RelationPatch, RelationPatch.parse(input));
  const [row] = await tx
    .update(entityRelations)
    .set(patch)
    .where(eq(entityRelations.id, relationId))
    .returning();
  if (!row) throw new NotFound('relation', relationId);
  return row;
}

export async function removeRelation(tx: Executor, relationId: string) {
  const rows = await tx
    .delete(entityRelations)
    .where(eq(entityRelations.id, relationId))
    .returning();
  if (rows.length === 0) throw new NotFound('relation', relationId);
}
