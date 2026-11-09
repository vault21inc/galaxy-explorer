import { z } from 'zod';
import { schemasFor } from './derive-schemas.ts';
import type { EntityKind } from './entity-kinds.ts';

/**
 * The Zod schema behind one form field, found by its path in the kind's update schema
 * (`appearance.color` walks into the appearance document, `appearance.scale.galaxy` into a
 * per-view record). The editor validates with it and reads limits from it, so a form never
 * repeats what the schema already says.
 */
export function fieldSchema(kind: EntityKind, path: string): z.ZodType | undefined {
  let schema: z.ZodType | undefined = schemasFor(kind).update;
  for (const key of path.split('.')) {
    const parent: z.ZodType | undefined = schema ? unwrapField(schema).inner : undefined;
    if (parent instanceof z.ZodObject) {
      schema = (parent.shape as Record<string, z.ZodType>)[key];
    } else if (parent instanceof z.ZodRecord) {
      // Any key the record's key schema accepts (a view level) has the value schema.
      schema = z.safeParse(parent.keyType, key).success
        ? (parent.valueType as z.ZodType)
        : undefined;
    } else {
      schema = undefined;
    }
  }
  return schema;
}

/** A field's schema without its optional, nullable and default wrappers. */
export function unwrapField(schema: z.ZodType): { inner: z.ZodType; nullable: boolean } {
  let inner = schema;
  let nullable = false;
  for (;;) {
    if (inner instanceof z.ZodNullable) nullable = true;
    if (
      inner instanceof z.ZodOptional ||
      inner instanceof z.ZodNullable ||
      inner instanceof z.ZodDefault
    ) {
      inner = inner.def.innerType as z.ZodType;
    } else {
      return { inner, nullable };
    }
  }
}

/** A number field's limits, for inputs and sliders. */
export function numberLimits(schema: z.ZodType | undefined): {
  min: number | undefined;
  max: number | undefined;
  integer: boolean;
} {
  const inner = schema ? unwrapField(schema).inner : undefined;
  if (!(inner instanceof z.ZodNumber)) return { min: undefined, max: undefined, integer: false };
  return {
    min: Number.isFinite(inner.minValue) ? (inner.minValue ?? undefined) : undefined,
    max: Number.isFinite(inner.maxValue) ? (inner.maxValue ?? undefined) : undefined,
    // z.int() is a number with an integer format ('safeint', 'int32'…).
    integer: inner.format?.includes('int') ?? false,
  };
}
