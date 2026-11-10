import type { BatchRequest, ViewObject } from '@ge/domain';

/** Something the editor can delete from the view: an object, or a group (M4-T2). */
export interface Deletable extends Pick<ViewObject, 'id' | 'version' | 'namePlain'> {
  /** An object when left out. */
  kind?: 'celestial_object' | 'group';
}

const count = (n: number, one: string, many: string) => `${n.toString()} ${n === 1 ? one : many}`;

/**
 * The history entry for a delete: `Delete “Gudrun System”`, or `Delete 3 objects`, `Delete 2
 * groups`, or `Delete 4 items` for both together.
 */
export function deleteDescription(items: readonly Pick<Deletable, 'namePlain' | 'kind'>[]): string {
  const [only] = items;
  if (items.length === 1 && only) return `Delete “${only.namePlain}”`;
  const groups = items.filter((item) => item.kind === 'group').length;
  if (groups === items.length) return `Delete ${count(groups, 'group', 'groups')}`;
  if (groups === 0) return `Delete ${count(items.length, 'object', 'objects')}`;
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
