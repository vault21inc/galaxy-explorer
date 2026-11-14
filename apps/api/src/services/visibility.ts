import { schema } from '@ge/db';
import type { UniverseAccess } from '@ge/domain';
import { sql, type SQL } from 'drizzle-orm';
import { atLeast } from './access.ts';

/**
 * Who can see drafts (data-model §8). Drafts are secret, unlike spoilers, so they're filtered
 * on the server: an anonymous reader never receives a draft, anything on a draft map, or the
 * children of a draft object.
 */
export interface Viewer {
  includeDrafts: boolean;
}

/**
 * The viewer for a request (M8-T11): drafts only when asked for with `includeDrafts=true`, and
 * only for someone who may edit the universe (the access guard refuses anyone else who asks).
 */
export function viewerFor(
  access: UniverseAccess | null,
  options: { includeDrafts?: boolean | undefined } = {},
): Viewer {
  return {
    includeDrafts: options.includeDrafts === true && access !== null && atLeast(access, 'edit'),
  };
}

/** Editors in tests and internal code that must see everything. */
export const SEES_EVERYTHING: Viewer = { includeDrafts: true };

const { entities } = schema;

/** A condition on `entities` that keeps only what the viewer may see. */
export function entityVisible(viewer: Viewer): SQL {
  if (viewer.includeDrafts) return sql`true`;
  return sql`(
    ${entities.status} = 'published'
    and (${entities.mapId} is null
         or exists (select 1 from maps m where m.id = ${entities.mapId} and m.status = 'published'))
    and not exists (
      with recursive ancestors(id) as (
        select co.parent_id from celestial_objects co where co.entity_id = ${entities.id}
        union all
        select co.parent_id from celestial_objects co join ancestors a on co.entity_id = a.id
      )
      select 1 from ancestors a join entities pe on pe.id = a.id where pe.status = 'draft'))`;
}
