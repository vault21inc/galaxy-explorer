import { z } from 'zod';
import { HexColor } from '../colors.ts';
import { Uuid } from '../ids.ts';
import { Appearance } from '../schemas/appearance.ts';
import { GroupStyle } from '../schemas/styles.ts';
import { BASE_TYPES } from './object-types.ts';

/**
 * The kind-specific fields of each entity kind: the columns of its extension table
 * (data-model §3.3), in the API's camelCase. Fields marked `.optional()` may be left out on
 * create, where the database default applies.
 */

export const celestialObjectExtension = z.object({
  /** Null puts the object at the top level, in the galaxy view. */
  parentId: Uuid.nullable().optional(),
  baseType: z.enum(BASE_TYPES),
  subtypeId: Uuid.nullable().optional(),
  /** Opens its own view; allowed only when the base type has one. */
  explorable: z.boolean().optional(),
  /** Position in the parent's frame, in its unit (data-model §5). */
  x: z.number().optional(),
  y: z.number().optional(),
  z: z.number().optional(),
  /** Sparse overrides on the type and subtype defaults. */
  appearance: Appearance.optional(),
});

export const groupExtension = z.object({
  groupTypeId: Uuid,
  parentGroupId: Uuid.nullable().optional(),
  /** Defaults to the group type's color. */
  outlineColor: HexColor.optional(),
  style: GroupStyle.optional(),
});

export const eventExtension = z.object({
  categoryId: Uuid.nullable().optional(),
  /** Free text in the universe's date format, such as '240.M41' (E2). */
  dateText: z.string().max(200).nullable().optional(),
  /** An optional sort key chosen by the author. */
  dateSort: z.number().nullable().optional(),
});
