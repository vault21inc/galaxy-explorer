import type { ViewObject } from '@ge/domain';

type Orbiting = Pick<ViewObject, 'id' | 'namePlain' | 'orbitCenterId'>;

/**
 * The objects a move carries (D-29, M5-T4): the selection, plus every object that orbits a
 * selected star and isn't selected itself. Moving a star moves its planets by the same offset,
 * so their orbits keep their shape. In the order: the selection first, then the orbiters.
 */
export function withOrbiters(ids: readonly string[], objects: readonly Orbiting[]): string[] {
  const chosen = new Set(ids);
  const orbiters = objects
    .filter((object) => object.orbitCenterId !== null && chosen.has(object.orbitCenterId))
    .map((object) => object.id)
    .filter((id) => !chosen.has(id));
  return [...ids, ...orbiters];
}

/**
 * How a move reads in History and as an undo step: "Moved 3 objects", or, when stars carried
 * their orbiting objects along, "Moved Alpha Centauri B and 2 orbiting objects".
 */
export function moveDescription(
  selectedIds: readonly string[],
  movedIds: readonly string[],
  objects: readonly Orbiting[],
): string {
  const count = (n: number, one: string, many: string) => `${n.toString()} ${n === 1 ? one : many}`;
  const carried = movedIds.length - selectedIds.length;
  if (carried <= 0) {
    return `Moved ${count(movedIds.length, 'object', 'objects')}`;
  }
  const only = selectedIds.length === 1 ? selectedIds[0] : undefined;
  const name = objects.find((object) => object.id === only)?.namePlain;
  const what = name ?? count(selectedIds.length, 'object', 'objects');
  return `Moved ${what} and ${count(carried, 'orbiting object', 'orbiting objects')}`;
}
