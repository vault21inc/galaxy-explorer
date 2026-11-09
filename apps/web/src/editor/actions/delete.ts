import type { BatchRequest, ViewObject } from '@ge/domain';

/** The history entry for a delete: `Delete “Gudrun System”`, or `Delete 3 objects`. */
export function deleteDescription(objects: readonly Pick<ViewObject, 'namePlain'>[]): string {
  const [only] = objects;
  return objects.length === 1 && only
    ? `Delete “${only.namePlain}”`
    : `Delete ${objects.length.toString()} objects`;
}

/**
 * One batch that deletes the objects, each with the version the view read (a stale one fails
 * the whole batch with 409). The same request runs first as a dry run for the impact.
 */
export function deleteRequest(
  objects: readonly Pick<ViewObject, 'id' | 'version' | 'namePlain'>[],
  dryRun: boolean,
): BatchRequest {
  return {
    description: deleteDescription(objects),
    ...(dryRun ? { dryRun: true } : {}),
    operations: objects.map((object) => ({
      op: 'delete' as const,
      kind: 'celestial_object' as const,
      id: object.id,
      version: object.version,
    })),
  };
}
