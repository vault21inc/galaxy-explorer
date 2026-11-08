import {
  entityKinds,
  HIDE_SPOILERS,
  redactEntity,
  type EntityKind,
  type RedactableEntity,
} from '@ge/domain';

/** `spoilers=include` (the default) or `spoilers=exclude` (architecture.md §10). */
export type SpoilerMode = 'include' | 'exclude';

/**
 * Applies `spoilers=exclude`: the same redaction the browser applies, done on the server for
 * clients that must never receive spoilers (search snippets, crawlers, cautious API clients).
 */
export function applySpoilers<T extends object>(kind: EntityKind, read: T, mode: SpoilerMode): T {
  if (mode === 'include') return read;
  return redactEntity(read as unknown as RedactableEntity, HIDE_SPOILERS, {
    contentFields: entityKinds[kind].contentFields as never,
  }) as unknown as T;
}
