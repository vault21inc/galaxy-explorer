import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  IMAGE_ROLES,
  CONFIG_RESOURCES,
  ENTITY_KINDS,
  ENTITY_STATUSES,
  entityKinds,
  fieldPaths,
  fieldSchema,
  formGroups,
  numberLimits,
  STATUS_LABELS,
  unwrapField,
  type FormWidget,
} from '../src/index.ts';

/**
 * The editor forms are data (entity-forms.ts). These tests keep that data honest against the
 * Zod schemas, so a renamed field or a wrong widget fails here rather than in the browser.
 */

/** What each widget edits, as the Zod class of its unwrapped schema. */
const WIDGET_SCHEMA: Partial<Record<FormWidget, (schema: z.ZodType) => boolean>> = {
  name: (schema) => schema instanceof z.ZodObject && 'source' in schema.shape,
  richText: (schema) => schema instanceof z.ZodObject && 'source' in schema.shape,
  switch: (schema) => schema instanceof z.ZodBoolean,
  number: (schema) => schema instanceof z.ZodNumber,
  text: (schema) => schema instanceof z.ZodString,
  color: (schema) => schema instanceof z.ZodString,
  perViewScale: (schema) => schema instanceof z.ZodRecord,
  rimGaps: (schema) => schema instanceof z.ZodArray,
  riftPath: (schema) => schema instanceof z.ZodArray,
  list: (schema) => schema instanceof z.ZodArray,
  defaultLook: (schema) => schema instanceof z.ZodObject,
};

describe.each(ENTITY_KINDS)('the %s form', (kind) => {
  const fields = formGroups(entityKinds[kind].form).flatMap((group) => group.fields);

  it('starts with the name, summary and description', () => {
    expect(fields.slice(0, 3).map((field) => fieldPaths(field)[0])).toEqual([
      'name',
      'summary',
      'description',
    ]);
  });

  it.each(fields.map((field) => [field.label, field] as const))(
    '%s writes fields of the update schema with a fitting widget',
    (_label, field) => {
      for (const path of fieldPaths(field)) {
        const schema = fieldSchema(kind, path);
        expect(schema, path).toBeDefined();
        if (!schema) continue;
        const check = WIDGET_SCHEMA[field.widget];
        if (check) expect(check(unwrapField(schema).inner), path).toBe(true);
      }
      if (field.widget === 'select' && field.options.from === 'config') {
        expect(CONFIG_RESOURCES).toContain(field.options.resource);
      }
      if (field.widget === 'imageRole') expect(IMAGE_ROLES).toContain(field.role);
    },
  );
});

describe('form helpers', () => {
  it('the status choices are the schema’s', () => {
    expect(Object.keys(STATUS_LABELS)).toEqual([...ENTITY_STATUSES]);
  });

  it('reads number limits from the schema', () => {
    expect(numberLimits(fieldSchema('celestial_object', 'appearance.labelPriority'))).toEqual({
      min: 0,
      max: 10,
      integer: true,
    });
    expect(numberLimits(fieldSchema('event', 'dateSort'))).toEqual({
      min: undefined,
      max: undefined,
      integer: false,
    });
  });

  it('walks into per-view records', () => {
    expect(numberLimits(fieldSchema('celestial_object', 'appearance.scale.galaxy'))).toEqual({
      min: 0.05,
      max: 20,
      integer: false,
    });
    expect(fieldSchema('celestial_object', 'appearance.scale.nowhere')).toBeUndefined();
  });

  it('knows nullable fields', () => {
    const subtype = fieldSchema('celestial_object', 'subtypeId');
    expect(subtype && unwrapField(subtype).nullable).toBe(true);
    const explorable = fieldSchema('celestial_object', 'explorable');
    expect(explorable && unwrapField(explorable).nullable).toBe(false);
  });

  it('a missing path has no schema', () => {
    expect(fieldSchema('character', 'x')).toBeUndefined();
    expect(fieldSchema('celestial_object', 'appearance.nothing')).toBeUndefined();
  });
});
