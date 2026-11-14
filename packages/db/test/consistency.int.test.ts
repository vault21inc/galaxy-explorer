import {
  ACCOUNT_LINK_PURPOSES,
  ACTOR_TYPES,
  BASE_TYPES,
  ENTITY_KINDS,
  ENTITY_STATUSES,
  entityKinds,
  FIELD_VALUE_TYPES,
  IMAGE_ROLES,
  LOCATION_MODES,
  RELATION_TYPES,
  SITE_ROLES,
} from '@ge/domain';
import { sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import type { Database } from '../src/client.ts';
import { withTestDb } from '../src/testing/index.ts';

// The registries in @ge/domain and the applied migrations must agree (architecture.md §3.6).
// The migration's check lists are generated from the registries, so these fail when a registry
// changes without a new migration.

/** The quoted values in a check constraint, as Postgres prints it back. */
async function checkValues(db: Database, constraint: string): Promise<string[]> {
  const result = await db.execute<{ def: string }>(
    sql`select pg_get_constraintdef(oid) as def from pg_constraint where conname = ${constraint}`,
  );
  const definition = result.rows[0]?.def;
  if (!definition) throw new Error(`No constraint named ${constraint}.`);
  return [...definition.matchAll(/'([^']*)'::text/g)].map((match) => match[1] ?? '');
}

const UNIVERSE_SCOPED = ENTITY_KINDS.filter((kind) => entityKinds[kind].scope === 'universe');

describe('registry ↔ database consistency', () => {
  it.each([
    ['entities_kind_check', ENTITY_KINDS],
    ['entities_status_check', ENTITY_STATUSES],
    ['entities_scope_check', UNIVERSE_SCOPED],
    ['maps_status_check', ENTITY_STATUSES],
    ['celestial_objects_base_type_check', BASE_TYPES],
    ['object_subtypes_base_type_check', BASE_TYPES],
    ['field_definitions_applies_to_base_type_check', BASE_TYPES],
    ['field_definitions_applies_to_kind_check', ENTITY_KINDS],
    ['field_definitions_value_type_check', FIELD_VALUE_TYPES],
    ['relations_type_check', RELATION_TYPES],
    ['entity_images_role_check', IMAGE_ROLES],
    ['entity_locations_mode_check', LOCATION_MODES],
    ['change_batches_actor_type_check', ACTOR_TYPES],
    ['users_role_check', SITE_ROLES],
    ['account_links_purpose_check', ACCOUNT_LINK_PURPOSES],
    ['account_links_role_check', SITE_ROLES],
  ])('%s lists exactly the registry values', (constraint, values) =>
    withTestDb(async (db) => {
      expect((await checkValues(db, constraint)).sort()).toEqual([...values].sort());
    }),
  );

  it('makes every foreign key deferrable, initially immediate (data-model §2)', () =>
    withTestDb(async (db) => {
      const result = await db.execute<{ name: string; deferrable: boolean; deferred: boolean }>(sql`
        select conname as name, condeferrable as deferrable, condeferred as deferred
        from pg_constraint where contype = 'f' and connamespace = 'public'::regnamespace`);
      expect(result.rows.length).toBeGreaterThan(30);
      const wrong = result.rows
        .filter((row) => !row.deferrable || row.deferred)
        .map((row) => row.name);
      expect(wrong).toEqual([]);
    }));

  it('gives every map-scoped table a foreign key on map_id or through its entity', () =>
    withTestDb(async (db) => {
      // Tables with a map_id column whose foreign keys never mention map_id would let rows
      // drift between maps.
      const result = await db.execute<{ table: string }>(sql`
        select c.table_name as table from information_schema.columns c
        where c.table_schema = 'public' and c.column_name = 'map_id'
          and not exists (
            select 1 from pg_constraint k
            join pg_attribute a on a.attrelid = k.conrelid and a.attnum = any (k.conkey)
            where k.contype = 'f' and k.conrelid = format('public.%I', c.table_name)::regclass
              and a.attname = 'map_id')`);
      expect(result.rows).toEqual([]);
    }));
});
