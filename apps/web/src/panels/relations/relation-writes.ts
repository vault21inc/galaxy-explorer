import { unwrap, type components, type paths } from '@ge/api-client';
import { entityKinds, rt, type EntityKind, type RelationType } from '@ge/domain';
import type { QueryClient } from '@tanstack/react-query';
import { api } from '@/api/client.ts';
import { describedAs, throwIfRefused, writeAspect } from '../aspect-writes.ts';

export type RelationRead = components['schemas']['RelationRead'];
/** What a relation's edit may change: the PATCH body, as the generated client has it. */
type RelationPatch = NonNullable<
  paths['/api/v1/entities/{entityId}/relations/{relationId}']['patch']['requestBody']
>['content']['application/json'];

/** The writes of the relation sections (M6-T6), through aspect-writes.ts. */

export interface Endpoints {
  type: RelationType;
  /** The relation's `from` and `to` ends. */
  fromId: string;
  toId: string;
  /** Both ends' kinds, whose panels refresh. */
  kinds: readonly EntityKind[];
}

/** Relates two existing entities: "Add “Eisenhorn” to “Siege of Calyx”". */
export function addRelation(queryClient: QueryClient, ends: Endpoints, description: string) {
  return writeAspect(queryClient, ends.kinds, 'add them', () =>
    unwrap(
      api.POST('/api/v1/entities/{entityId}/relations', {
        params: { path: { entityId: ends.fromId } },
        body: { relationType: ends.type, toEntityId: ends.toId },
        headers: describedAs(description),
      }),
    ),
  );
}

/**
 * Creates an entity named `name` and relates it, as one batch (one undo removes both): the
 * picker's "Create “…”". `newEnd` says which end the new entity is; the other is `otherId`.
 */
export function createAndRelate(
  queryClient: QueryClient,
  args: {
    type: RelationType;
    kind: EntityKind;
    name: string;
    scope: { mapId: string } | { universeId: string };
    newEnd: 'from' | 'to';
    otherId: string;
    otherKind: EntityKind;
  },
) {
  const { type, kind, name, scope, newEnd, otherId, otherKind } = args;
  const label = entityKinds[kind].label.one.toLowerCase();
  return writeAspect(queryClient, [kind, otherKind], `create the ${label}`, () =>
    unwrap(
      api.POST('/api/v1/batch', {
        body: {
          description: `Create ${label} “${name}”`,
          operations: [
            { op: 'create' as const, kind, ...scope, data: { name: rt.plain(name) } },
            newEnd === 'from'
              ? {
                  op: 'addRelation' as const,
                  id: '$op:0',
                  data: { relationType: type, toEntityId: otherId },
                }
              : {
                  op: 'addRelation' as const,
                  id: otherId,
                  data: { relationType: type, toEntityId: '$op:0' },
                },
          ],
        },
      }),
    ),
  );
}

/** Changes a relation's role or spoiler flag. */
export function updateRelation(
  queryClient: QueryClient,
  relation: RelationRead,
  kinds: readonly EntityKind[],
  patch: RelationPatch,
  description: string,
) {
  return writeAspect(queryClient, kinds, 'save it', () =>
    unwrap(
      api.PATCH('/api/v1/entities/{entityId}/relations/{relationId}', {
        params: { path: { entityId: relation.fromEntityId, relationId: relation.id } },
        body: patch,
        headers: describedAs(description),
      }),
    ),
  );
}

/** Removes a relation. */
export function removeRelation(
  queryClient: QueryClient,
  relation: RelationRead,
  kinds: readonly EntityKind[],
  description: string,
) {
  return writeAspect(queryClient, kinds, 'remove it', async () => {
    const { error } = await api.DELETE('/api/v1/entities/{entityId}/relations/{relationId}', {
      params: { path: { entityId: relation.fromEntityId, relationId: relation.id } },
      headers: describedAs(description),
    });
    throwIfRefused(error);
  });
}
