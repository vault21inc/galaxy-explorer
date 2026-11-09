import { schemasFor, type BatchOperation, type EntityReadOf, type RichText } from '@ge/domain';

/** Copies land this far along +x, in the view's unit (ux.md §5). */
export const DUPLICATE_OFFSET = 20;

/** An object as read with its facts (`include=facts`). */
export type DuplicableObject = EntityReadOf<'celestial_object'> & {
  facts?: readonly {
    fieldDefinitionId: string;
    value: unknown;
    isSpoiler: boolean;
    sortKey: number | null;
  }[];
};

/**
 * The writable fields of an object, from the kind's create schema (so a new field is copied
 * without touching this file), less `externalKey`, which must stay unique.
 */
const COPIED_FIELDS = Object.keys(schemasFor('celestial_object').create.shape).filter(
  (field) => field !== 'externalKey',
);

/** The name of a copy: the same text with " copy" after it, in any format. */
export function copyName(name: RichText): RichText {
  if (name.format === 'html') {
    // Inside a closing paragraph, if the name ends with one, so it stays one line.
    const match = /<\/p>\s*$/.exec(name.source);
    if (match) {
      return { ...name, source: `${name.source.slice(0, match.index)} copy${match[0]}` };
    }
  }
  return { ...name, source: `${name.source} copy` };
}

/**
 * The batch operations that duplicate objects (ux.md §5): each copy is a create with the
 * original's fields and appearance, a new name and an offset position, followed by its facts.
 * Relations and group memberships aren't copied. `$op:N` points the facts at the copy.
 */
export function duplicateOperations(
  objects: readonly DuplicableObject[],
  mapId: string,
): BatchOperation[] {
  const operations: BatchOperation[] = [];
  for (const object of objects) {
    const data: Record<string, unknown> = {};
    for (const field of COPIED_FIELDS) data[field] = (object as Record<string, unknown>)[field];
    data.name = copyName(object.name);
    data.x = object.x + DUPLICATE_OFFSET;
    const createIndex = operations.length;
    operations.push({ op: 'create', kind: 'celestial_object', mapId, data });
    const facts = (object.facts ?? []).map(({ fieldDefinitionId, value, isSpoiler, sortKey }) => ({
      fieldDefinitionId,
      value,
      isSpoiler,
      sortKey,
    }));
    // setFacts takes at most 100 facts per operation.
    for (let start = 0; start < facts.length; start += 100) {
      operations.push({
        op: 'setFacts',
        id: `$op:${createIndex.toString()}`,
        data: facts.slice(start, start + 100),
      });
    }
  }
  return operations;
}
