import { BASE_TYPES, objectTypes, viewLevels, type BaseType, type ViewLevel } from '@ge/domain';

/**
 * The base types that can be added directly in a view (M3-T2): those whose allowed parents
 * include the view's subject. In the galaxy view that's the map itself; in a system view
 * (M5), a system. Read from the object-types registry, so a new type appears on its own.
 */
export function placeableTypes(level: ViewLevel): BaseType[] {
  const subject = viewLevels[level].subject;
  const parents: readonly string[] = subject === 'map' ? ['map'] : subject;
  return BASE_TYPES.filter((type) => {
    const allowed: readonly string[] = objectTypes[type].parents;
    return allowed.some((parent) => parents.includes(parent));
  });
}

/** "New system", "New black hole": a new object's default name. */
export function defaultName(type: BaseType): string {
  return `New ${objectTypes[type].label.toLowerCase()}`;
}
