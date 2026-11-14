import {
  BASE_TYPES,
  ENTITY_KINDS,
  ENTITY_STATUSES,
  entityKinds,
  HEX_COLOR_PATTERN,
  LOCATION_MODES,
  type Appearance,
  type GroupStyle,
  type RichText,
  type RouteStyle,
} from '@ge/domain';
import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  doublePrecision,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { idColumn, isSpoilerColumn, matches, oneOf, stamps, tsvector } from './helpers.ts';

/** Kinds shared by every map of a universe, from the registry (characters). */
const UNIVERSE_SCOPED_KINDS = ENTITY_KINDS.filter((kind) => entityKinds[kind].scope === 'universe');

/**
 * Everything the author writes about (data-model §3.2): the fields every kind shares.
 * Kind-specific fields live in extension tables keyed by `entity_id`.
 */
export const entities = pgTable(
  'entities',
  {
    id: idColumn(),
    universeId: uuid().notNull(),
    /** Null for universe-scoped kinds. */
    mapId: uuid(),
    kind: text().notNull(),
    name: jsonb().$type<RichText>().notNull(),
    namePlain: text().notNull(),
    summary: jsonb().$type<RichText>(),
    description: jsonb().$type<RichText>(),
    isSpoiler: isSpoilerColumn(),
    status: text().notNull().default('published'),
    /** A stable key for imports and LLM agents. */
    externalKey: text(),
    /** Lineage across cloned maps (U7). */
    clonedFromEntityId: uuid(),
    ...stamps(),
    /**
     * Full-text search (M7-T6, data-model §12): everything, and what a reader who hides spoilers
     * may find. Derived from the entity, its text facts and its relations' roles, and
     * refreshed when a change batch ends (search/refresh.ts), never edited.
     */
    searchPublic: tsvector(),
    searchAll: tsvector(),
  },
  (t) => [
    // The target of same-map composite foreign keys (data-model §2).
    unique('entities_id_map_uq').on(t.id, t.mapId),
    check('entities_kind_check', oneOf(t.kind, ENTITY_KINDS)),
    check('entities_status_check', oneOf(t.status, ENTITY_STATUSES)),
    // Universe-scoped kinds have no map; every other kind has one.
    check(
      'entities_scope_check',
      sql`(${oneOf(t.kind, UNIVERSE_SCOPED_KINDS)}) = (${t.mapId} is null)`,
    ),
    index('entities_map_kind_idx').on(t.mapId, t.kind),
    index('entities_search_public_idx').using('gin', t.searchPublic),
    index('entities_search_all_idx').using('gin', t.searchAll),
  ],
);

/** Columns and constraints every extension table repeats (`‹entity-fk›` in data-model §3). */
const extensionKey = () => ({ entityId: uuid().primaryKey(), mapId: uuid().notNull() });

/** Stars, planets, stations, nebulae… (data-model §3.3). Positions are in the parent's frame. */
export const celestialObjects = pgTable(
  'celestial_objects',
  {
    ...extensionKey(),
    /** Null puts the object at the top level, in the galaxy view. */
    parentId: uuid(),
    /**
     * The star it orbits, in the same system (D-29, an "S-type" orbit); null orbits the system's
     * center. A composite foreign key, written in the migration, keeps it on the same map and
     * clears it when the star is deleted.
     */
    orbitCenterId: uuid(),
    baseType: text().notNull(),
    subtypeId: uuid(),
    /** Opens its own view; allowed only when the base type has one (checked by the service). */
    explorable: boolean().notNull().default(false),
    x: doublePrecision().notNull().default(0),
    y: doublePrecision().notNull().default(0),
    z: doublePrecision().notNull().default(0),
    /** Sparse overrides on the type and subtype defaults. */
    appearance: jsonb().$type<Appearance>().notNull().default({}),
  },
  (t) => [
    unique('celestial_objects_entity_map_uq').on(t.entityId, t.mapId),
    check('celestial_objects_base_type_check', oneOf(t.baseType, BASE_TYPES)),
    check('celestial_objects_not_own_parent', sql`${t.parentId} is distinct from ${t.entityId}`),
    check(
      'celestial_objects_not_own_orbit_center',
      sql`${t.orbitCenterId} is distinct from ${t.entityId}`,
    ),
    index('celestial_objects_parent_idx').on(t.mapId, t.parentId),
    index('celestial_objects_orbit_center_idx').on(t.mapId, t.orbitCenterId),
  ],
);

/** Territories, sectors and sub-sectors (T5, U6). */
export const objectGroups = pgTable(
  'object_groups',
  {
    ...extensionKey(),
    groupTypeId: uuid().notNull(),
    parentGroupId: uuid(),
    /** Defaults to the group type's color (set by the service). */
    outlineColor: text().notNull(),
    style: jsonb().$type<GroupStyle>().notNull().default({}),
  },
  (t) => [
    unique('object_groups_entity_map_uq').on(t.entityId, t.mapId),
    // The target of group_members' foreign key, which carries the type for the rule below.
    unique('object_groups_entity_type_uq').on(t.entityId, t.groupTypeId),
    check('object_groups_outline_color_format', matches(t.outlineColor, HEX_COLOR_PATTERN)),
  ],
);

/** Which top-level objects belong to which group. */
export const groupMembers = pgTable(
  'group_members',
  {
    groupId: uuid().notNull(),
    /** Copied from the group, so the unique constraint below can see it. */
    groupTypeId: uuid().notNull(),
    mapId: uuid().notNull(),
    objectId: uuid().notNull(),
    /** The membership itself is a potential spoiler. */
    isSpoiler: isSpoilerColumn(),
  },
  (t) => [
    primaryKey({ name: 'group_members_pk', columns: [t.groupId, t.objectId] }),
    // An object is in at most one group of each type.
    unique('group_members_one_group_per_type_uq').on(t.objectId, t.groupTypeId),
  ],
);

/** A line through objects in order (M4-T7, data-model §3.3). Its look is `style`. */
export const routes = pgTable(
  'routes',
  {
    ...extensionKey(),
    style: jsonb().$type<RouteStyle>().notNull().default({}),
  },
  (t) => [unique('routes_entity_map_uq').on(t.entityId, t.mapId)],
);

/**
 * A route's waypoints: the objects it passes through, by `seq` from 0. The same object may
 * appear more than once (a route that doubles back). Deleting an object removes its waypoints.
 */
export const routeWaypoints = pgTable(
  'route_waypoints',
  {
    routeId: uuid().notNull(),
    seq: integer().notNull(),
    mapId: uuid().notNull(),
    objectId: uuid().notNull(),
  },
  (t) => [
    primaryKey({ name: 'route_waypoints_pk', columns: [t.routeId, t.seq] }),
    check('route_waypoints_seq_check', sql`${t.seq} >= 0`),
    index('route_waypoints_object_idx').on(t.objectId),
  ],
);

/** Something that happened. Its place in time is free text in the universe's format (E2). */
export const events = pgTable(
  'events',
  {
    ...extensionKey(),
    categoryId: uuid(),
    dateText: text(),
    /** An optional sort key chosen by the author. */
    dateSort: numeric({ mode: 'number' }),
  },
  (t) => [
    unique('events_entity_map_uq').on(t.entityId, t.mapId),
    index('events_date_idx').on(t.mapId, t.dateSort),
  ],
);

/** Where a place or event is (E3, E4). The check below spells out each mode's columns. */
export const entityLocations = pgTable(
  'entity_locations',
  {
    ...extensionKey(),
    mode: text().notNull(),
    /** surface, object: the body. space: the system whose frame x, y, z use (null = galaxy). */
    objectId: uuid(),
    /** place: the place entity. */
    placeId: uuid(),
    latDeg: doublePrecision(),
    lonDeg: doublePrecision(),
    x: doublePrecision(),
    y: doublePrecision(),
    z: doublePrecision(),
    /** The location is a spoiler: the pin isn't shown at all (P2). */
    isSpoiler: isSpoilerColumn(),
  },
  (t) => [
    unique('entity_locations_entity_map_uq').on(t.entityId, t.mapId),
    check('entity_locations_mode_check', oneOf(t.mode, LOCATION_MODES)),
    check('entity_locations_lat_range', sql`${t.latDeg} between -90 and 90`),
    check('entity_locations_lon_range', sql`${t.lonDeg} >= -180 and ${t.lonDeg} < 180`),
    check(
      'entity_locations_mode_columns',
      sql.raw(`case mode
        when 'surface' then object_id is not null and lat_deg is not null and lon_deg is not null
                            and place_id is null and x is null and y is null and z is null
        when 'object'  then object_id is not null and lat_deg is null and lon_deg is null
                            and place_id is null and x is null and y is null and z is null
        when 'space'   then x is not null and y is not null and z is not null
                            and lat_deg is null and lon_deg is null and place_id is null
        when 'place'   then place_id is not null and object_id is null and lat_deg is null
                            and lon_deg is null and x is null and y is null and z is null
      end`),
    ),
    index('entity_locations_object_idx').on(t.objectId),
    index('entity_locations_place_idx').on(t.placeId),
  ],
);
