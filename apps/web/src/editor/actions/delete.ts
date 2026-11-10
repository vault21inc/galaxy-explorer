import { entityKinds, type BatchRequest, type ViewObject } from '@ge/domain';

/** Something the editor can delete from the view: an object, a group (M4-T2) or a route (M4-T7). */
export interface Deletable extends Pick<ViewObject, 'id' | 'version' | 'namePlain'> {
  /** An object when left out. */
  kind?: 'celestial_object' | 'group' | 'route';
}

const count = (n: number, one: string, many: string) => `${n.toString()} ${n === 1 ? one : many}`;

/** A kind in words, from the registry; celestial objects are just "objects" in the editor. */
function nouns(kind: NonNullable<Deletable['kind']>): [one: string, many: string] {
  if (kind === 'celestial_object') return ['object', 'objects'];
  const { label } = entityKinds[kind];
  return [label.one.toLowerCase(), label.many.toLowerCase()];
}

/**
 * The history entry for a delete: `Delete “Gudrun System”`, or `Delete 3 objects`, `Delete 2
 * groups`, or `Delete 4 items` for several kinds together.
 */
export function deleteDescription(items: readonly Pick<Deletable, 'namePlain' | 'kind'>[]): string {
  const [only] = items;
  if (items.length === 1 && only) return `Delete “${only.namePlain}”`;
  const kinds = new Set(items.map((item) => item.kind ?? 'celestial_object'));
  const [kind] = kinds;
  if (kinds.size === 1 && kind) return `Delete ${count(items.length, ...nouns(kind))}`;
  return `Delete ${count(items.length, 'item', 'items')}`;
}

/**
 * One batch that deletes the items, each with the version the view read (a stale one fails
 * the whole batch with 409). The same request runs first as a dry run for the impact.
 */
export function deleteRequest(items: readonly Deletable[], dryRun: boolean): BatchRequest {
  return {
    description: deleteDescription(items),
    ...(dryRun ? { dryRun: true } : {}),
    operations: items.map((item) => ({
      op: 'delete' as const,
      kind: item.kind ?? ('celestial_object' as const),
      id: item.id,
      version: item.version,
    })),
  };
}
