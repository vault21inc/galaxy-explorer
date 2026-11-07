import { schema, type Executor } from '@ge/db';
import type { EntityKind } from '@ge/domain';
import { eq } from 'drizzle-orm';
import { NotFound } from '../errors.ts';
import type { AspectOwner } from '../rules/aspects.ts';

/** Loads the entity an aspect URL names (`/entities/{id}/links`). */
export async function requireOwner(ex: Executor, entityId: string): Promise<AspectOwner> {
  const [row] = await ex.select().from(schema.entities).where(eq(schema.entities.id, entityId));
  if (!row) throw new NotFound('entity', entityId);
  return { id: row.id, kind: row.kind as EntityKind, universeId: row.universeId, mapId: row.mapId };
}
