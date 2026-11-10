import { describe, expect, it } from 'vitest';
import {
  CONFIG_RESOURCES,
  configResources,
  configSchemasFor,
  fieldPaths,
  fieldSchemaIn,
  universeForm,
  unwrapField,
} from '../src/registry/index.ts';
import { UniverseUpdate } from '../src/schemas/containers.ts';
import { z } from 'zod';

/**
 * The settings page's forms and tables as data (M4-T1): every column and field names a real
 * schema field, so a new config resource or universe setting can't drift from its schema.
 */
describe('settings forms', () => {
  it.each(CONFIG_RESOURCES)('%s: every column is a field of its schema', (resource) => {
    const { update } = configSchemasFor(resource);
    for (const column of configResources[resource].columns) {
      for (const path of fieldPaths(column)) {
        expect(fieldSchemaIn(update, path), `${resource}.${path}`).toBeDefined();
      }
    }
  });

  it.each(CONFIG_RESOURCES)('%s: the columns cover every required field', (resource) => {
    const shape = configResources[resource].schema.shape as Record<string, z.ZodType>;
    const required = Object.entries(shape)
      .filter(([, schema]) => !(schema instanceof z.ZodOptional))
      .map(([field]) => field);
    const columns = configResources[resource].columns.flatMap((column) => fieldPaths(column));
    for (const field of required) expect(columns, `${resource}.${field}`).toContain(field);
  });

  it.each(CONFIG_RESOURCES)('%s: the new-row defaults are valid values', (resource) => {
    const { defaults } = configResources[resource];
    const partial = configResources[resource].schema.partial();
    expect(partial.safeParse(defaults).success).toBe(true);
  });

  it.each(CONFIG_RESOURCES)('%s: config selects name a config resource', (resource) => {
    for (const column of configResources[resource].columns) {
      if (column.widget === 'select' && column.options.from === 'config') {
        expect(CONFIG_RESOURCES).toContain(column.options.resource);
      }
    }
  });

  it('every universe form field is a field of UniverseUpdate', () => {
    for (const field of universeForm) {
      for (const path of fieldPaths(field)) {
        const schema = fieldSchemaIn(UniverseUpdate, path);
        expect(schema, path).toBeDefined();
        if (schema) expect(unwrapField(schema).inner).toBeInstanceOf(z.ZodType);
      }
    }
  });
});

describe('reserved map slugs', () => {
  it('refuses a map slug the settings page uses', async () => {
    const { MapCreate } = await import('../src/schemas/containers.ts');
    const plain = { format: 'plain', source: 'Settings', spoiler: false };
    expect(MapCreate.safeParse({ slug: 'settings', name: plain }).success).toBe(false);
    expect(MapCreate.safeParse({ slug: 'settings-era', name: plain }).success).toBe(true);
  });
});
