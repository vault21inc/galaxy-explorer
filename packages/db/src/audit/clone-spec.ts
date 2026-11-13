/**
 * How `cloneMap()` (M7-T5) copies a map's content to a new map (data-model §10). Data only for
 * now. For each map-scoped table, in copy order:
 * - `freshIds`: columns that get a new UUID in the copy (the table's own surrogate id);
 * - `remap`: entity-id columns translated from old to new ids through the `clone_ids` table.
 *   Every copied row also gets the new `map_id`, `version` 1, and `entities` rows get
 *   `cloned_from_entity_id` set to the old id.
 *
 * An introspection test fails if a table with `map_id` or a foreign key to `entities` is
 * missing here.
 */
export interface CloneSpecEntry {
  table: string;
  freshIds: readonly string[];
  remap: readonly string[];
  /** How rows are chosen: by `map_id`, or (relations) by either end being in the map. */
  select: 'map_id' | 'entity_in_map' | 'either_end_in_map';
}

export const CLONE_SPEC: readonly CloneSpecEntry[] = [
  { table: 'entities', freshIds: [], remap: ['id'], select: 'map_id' },
  {
    table: 'celestial_objects',
    freshIds: [],
    remap: ['entity_id', 'parent_id', 'orbit_center_id'],
    select: 'map_id',
  },
  {
    table: 'object_groups',
    freshIds: [],
    remap: ['entity_id', 'parent_group_id'],
    select: 'map_id',
  },
  { table: 'group_members', freshIds: [], remap: ['group_id', 'object_id'], select: 'map_id' },
  { table: 'routes', freshIds: [], remap: ['entity_id'], select: 'map_id' },
  {
    table: 'route_waypoints',
    freshIds: [],
    remap: ['route_id', 'object_id'],
    select: 'map_id',
  },
  { table: 'events', freshIds: [], remap: ['entity_id'], select: 'map_id' },
  {
    table: 'entity_locations',
    freshIds: [],
    remap: ['entity_id', 'object_id', 'place_id'],
    select: 'map_id',
  },
  { table: 'entity_images', freshIds: [], remap: ['entity_id'], select: 'entity_in_map' },
  { table: 'entity_links', freshIds: ['id'], remap: ['entity_id'], select: 'entity_in_map' },
  { table: 'field_values', freshIds: [], remap: ['entity_id'], select: 'entity_in_map' },
  { table: 'citations', freshIds: ['id'], remap: ['entity_id'], select: 'entity_in_map' },
  // A relation from a character (universe-scoped) to an event in the map is copied, pointing
  // at the new event; relations between two universe-scoped entities aren't.
  {
    table: 'relations',
    freshIds: ['id'],
    remap: ['from_entity_id', 'to_entity_id'],
    select: 'either_end_in_map',
  },
];
