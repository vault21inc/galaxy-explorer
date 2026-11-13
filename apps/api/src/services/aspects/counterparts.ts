import { schema, type Executor } from '@ge/db';
import { and, asc, eq, inArray, ne, sql } from 'drizzle-orm';
import { entityVisible, type Viewer } from '../visibility.ts';

const { celestialObjects, entities, maps } = schema;

/**
 * The same object on other maps (M7-T5, D-17): every entity linked to this one through cloned
 * maps, in either direction. Cloning records each copy's original (`cloned_from_entity_id`),
 * so the lineage is a tree: climb to its root, the oldest original still there, then take
 * everything cloned from it, at any depth. That reaches the original, its other copies and
 * copies of copies. Only entities on other maps count, ordered as the map switcher orders
 * maps; a reader doesn't see drafts.
 */
export async function listCounterparts(ex: Executor, entityId: string, viewer: Viewer) {
  const lineage = await ex.execute<{ id: string }>(sql`
    with recursive up(id, from_id) as (
      select id, cloned_from_entity_id from entities where id = ${entityId}
      union all
      select e.id, e.cloned_from_entity_id from entities e join up on e.id = up.from_id
    ),
    down(id) as (
      select id from up where from_id is null
      union all
      select e.id from entities e join down on e.cloned_from_entity_id = down.id
    )
    select id from down`);
  const ids = lineage.rows.map((row) => row.id).filter((id) => id !== entityId);
  if (ids.length === 0) return [];
  const [self] = await ex
    .select({ mapId: entities.mapId })
    .from(entities)
    .where(eq(entities.id, entityId));
  const rows = await ex
    .select({
      id: entities.id,
      kind: entities.kind,
      namePlain: entities.namePlain,
      parentId: celestialObjects.parentId,
      map: {
        id: maps.id,
        slug: maps.slug,
        name: maps.name,
        namePlain: maps.namePlain,
        isSpoiler: maps.isSpoiler,
      },
    })
    .from(entities)
    .innerJoin(maps, eq(maps.id, entities.mapId))
    .leftJoin(celestialObjects, eq(celestialObjects.entityId, entities.id))
    .where(
      and(
        inArray(entities.id, ids),
        self?.mapId ? ne(entities.mapId, self.mapId) : undefined,
        entityVisible(viewer),
      ),
    )
    .orderBy(asc(maps.sortKey), asc(maps.namePlain));
  return rows.map((row) => ({ ...row, parentId: row.parentId ?? null }));
}
