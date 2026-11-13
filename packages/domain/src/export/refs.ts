import { z } from 'zod';
import { refFieldOf, type References, type ReferenceTarget } from '../registry/references.ts';

/**
 * References in an export (M7-T4, D-36). An export holds no database ids: they would change on
 * every import, and they make a file hard to read or write by hand. Instead each record is
 * referred to by a readable reference:
 * - an entity by its `externalKey`, or, without one, by a `ref` made from its name;
 * - a settings row by its name (a field definition by its key), or its `ref` when two share one;
 * - an asset by the SHA-256 of its upload.
 */

const TARGET_LABELS: Record<ReferenceTarget, string> = {
  entity: 'an entry’s `externalKey` or `ref`',
  asset: 'an asset’s `sha256`',
  group_types: 'a group type’s name',
  event_categories: 'an event category’s name',
  object_subtypes: 'an object subtype’s name',
  field_definitions: 'a field definition’s key',
};

/** A reference to another record of the export. */
export const Ref = z.string().trim().min(1).max(200);

export function refTo(target: ReferenceTarget) {
  return Ref.describe(`A reference to ${TARGET_LABELS[target]}.`);
}

/**
 * An object schema with its id fields swapped for references, each in the id field's place
 * and with its optional and nullable wrapping: `parentId: uuid | null` becomes
 * `parent: string | null`. Which fields are ids comes from the registries' `references`;
 * `names` renames one where dropping "Id" reads badly (a relation's `toEntityId` is `to`).
 */
export function withRefs(
  schema: z.ZodObject<Record<string, z.ZodType>>,
  references: References,
  names: Readonly<Record<string, string>> = {},
): z.ZodObject {
  const shape: Record<string, z.ZodType> = {};
  for (const [field, fieldSchema] of Object.entries(schema.shape)) {
    const target = references[field];
    if (target === undefined) {
      shape[field] = fieldSchema;
      continue;
    }
    let ref: z.ZodType = refTo(target);
    if (fieldSchema.safeParse(null).success) ref = ref.nullable();
    if (fieldSchema.safeParse(undefined).success) ref = ref.optional();
    shape[names[field] ?? refFieldOf(field)] = ref;
  }
  return z.strictObject(shape);
}

/** The longest ref made from a name. */
const MAX_REF_LENGTH = 60;

/** A name as a ref: "Gudrun Prime" is "gudrun-prime". */
export function slugRef(name: string, fallback: string): string {
  const slug = name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    // An apostrophe joins a word: "Theria's" is "therias", not "theria-s".
    .replace(/['\u2019]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, MAX_REF_LENGTH)
    .replace(/^-+|-+$/g, '');
  return slug === '' ? fallback : slug;
}

/**
 * Hands out refs unique within one namespace. Keys are reserved first, so a ref made from a
 * name never takes an entry's key; a name used twice gets "-2", "-3"… in the order asked.
 */
export class RefAllocator {
  readonly #taken = new Set<string>();

  /** Claims a ref if it's free; false if something already has it. */
  reserve(ref: string): boolean {
    if (this.#taken.has(ref)) return false;
    this.#taken.add(ref);
    return true;
  }

  has(ref: string): boolean {
    return this.#taken.has(ref);
  }

  /** `preferred` if free, else the first of `preferred-2`, `preferred-3`… that is. */
  take(preferred: string): string {
    let ref = preferred;
    for (let n = 2; this.#taken.has(ref); n++) ref = `${preferred}-${String(n)}`;
    this.#taken.add(ref);
    return ref;
  }
}
