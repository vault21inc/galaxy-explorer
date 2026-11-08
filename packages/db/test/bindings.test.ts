import { configResources, entityKinds } from '@ge/domain';
import { toSnakeCase } from 'drizzle-orm/casing';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import { CONFIG_TABLES, EXTENSION_TABLES } from '../src/schema/bindings.ts';

describe('extension table bindings', () => {
  it.each(Object.entries(entityKinds))('%s: binding agrees with the registry', (kind, def) => {
    const table = EXTENSION_TABLES[kind as keyof typeof EXTENSION_TABLES];
    expect(table === null).toBe(def.extension === null);
    if (!table || !def.extension) return;
    const columns = getTableConfig(table).columns.map((column) => toSnakeCase(column.name));
    for (const field of Object.keys(def.extension.shape)) {
      expect(columns, `${kind}.${field}`).toContain(toSnakeCase(field));
    }
    expect(columns).toEqual(expect.arrayContaining(['entity_id', 'map_id']));
  });
});

describe('config table bindings', () => {
  it.each(Object.entries(configResources))(
    '%s: every field is a column of its table',
    (name, resource) => {
      const columns = getTableConfig(CONFIG_TABLES[name as keyof typeof CONFIG_TABLES]).columns.map(
        (column) => toSnakeCase(column.name),
      );
      for (const field of Object.keys(resource.schema.shape)) {
        expect(columns, `${name}.${field}`).toContain(toSnakeCase(field));
      }
      expect(columns).toEqual(expect.arrayContaining(['id', 'universe_id']));
    },
  );
});
