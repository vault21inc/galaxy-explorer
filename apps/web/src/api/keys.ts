import type { ConfigResource, EntityKind, ViewLevel } from '@ge/domain';
import type { EntityOptions, ListFilters, ReadOptions } from './requests.ts';

/**
 * TanStack Query keys. The convention is `[kind | 'view', …params]`, so invalidating `[kind]`
 * refreshes every detail and list of that kind, and `['view']` every view payload: what M3's
 * edits need after a batch. Universes and maps follow the same shape.
 */
export const queryKeys = {
  entity: (kind: EntityKind, id: string, options: EntityOptions = {}) =>
    [kind, 'detail', id, options] as const,
  entityList: (kind: EntityKind, scope: object, filters: ListFilters = {}) =>
    [kind, 'list', scope, filters] as const,
  view: (level: ViewLevel, subjectId: string, options: ReadOptions = {}) =>
    ['view', level, subjectId, options] as const,
  configList: (resource: ConfigResource, universeId: string) =>
    [resource, 'list', { universeId }] as const,
  /** A universe's image library (M3-T7). */
  assets: (universeId: string) => ['asset', 'list', { universeId }] as const,
  universes: () => ['universe', 'list'] as const,
  maps: (universeId: string) => ['map', 'list', { universeId }] as const,
};
