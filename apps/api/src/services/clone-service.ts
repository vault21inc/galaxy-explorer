import { cloneMapContent, schema, type Executor } from '@ge/db';
import { MapClone, type MapRead } from '@ge/domain';
import { eq } from 'drizzle-orm';
import type { z } from 'zod';
import { createMap, getMap } from './container-service.ts';
import { SEES_EVERYTHING } from './visibility.ts';

/**
 * Cloning a map for another era (M7-T5, U7, D-17): "M41, before the Rift" becomes "M42,
 * after the Rift", and the owner changes what changed. One change batch, so one undo removes
 * the whole copy.
 *
 * The new map takes the original's settings (galaxy, underlay, description, spoiler flag and
 * status) with its own slug and name, records which map it came from, and gets a copy of all
 * its content (cloneMapContent, data-model §10).
 */
export async function cloneMap(
  tx: Executor,
  sourceMapId: string,
  input: z.input<typeof MapClone>,
): Promise<{ map: z.infer<typeof MapRead>; copied: Record<string, number> }> {
  const { slug, name, sortKey } = MapClone.parse(input);
  const source = await getMap(tx, sourceMapId, SEES_EVERYTHING);
  const created = await createMap(tx, source.universeId, {
    slug,
    name,
    description: source.description,
    // After the original in the map switcher, unless the request says where.
    sortKey: sortKey ?? source.sortKey + 1,
    galaxySettings: source.galaxySettings,
    underlayAssetId: source.underlayAssetId,
    underlay: source.underlay,
    isSpoiler: source.isSpoiler,
    status: source.status,
  });
  await tx
    .update(schema.maps)
    .set({ clonedFromMapId: source.id })
    .where(eq(schema.maps.id, created.id));
  const copied = await cloneMapContent(tx, source.id, created.id);
  return { map: await getMap(tx, created.id, SEES_EVERYTHING), copied };
}
