import { objectTypes, type BaseType, type ViewLevel } from '@ge/domain';

/**
 * The view an object opens, or null (architecture.md §3.3): its base type must open one
 * (`explorableAs`), and the author must have marked it explorable.
 */
export function viewOpenedBy(object: {
  baseType: BaseType;
  explorable: boolean;
}): ViewLevel | null {
  return object.explorable ? objectTypes[object.baseType].explorableAs : null;
}
