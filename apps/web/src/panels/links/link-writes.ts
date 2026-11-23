import { unwrap, type components, type paths } from '@ge/api-client';
import type { EntityKind } from '@ge/domain';
import type { QueryClient } from '@tanstack/react-query';
import { api } from '@/api/client.ts';
import { describedAs, throwIfRefused, writeAspect } from '../aspect-writes.ts';

export type LinkRead = components['schemas']['LinkRead'];
/** What a link's edit may change: the PATCH body, as the generated client has it. */
type LinkPatch = NonNullable<
  paths['/api/v1/entities/{entityId}/links/{linkId}']['patch']['requestBody']
>['content']['application/json'];

/** The entity whose links these are: its id, and its kind, whose panels refresh. */
interface Owner {
  id: string;
  kind: EntityKind;
}

/** Adds a link at the end of the list. */
export function addLink(
  queryClient: QueryClient,
  owner: Owner,
  link: { url: string; label: string | null; sortKey: number },
  description: string,
) {
  return writeAspect(queryClient, [owner.kind], 'add the link', () =>
    unwrap(
      api.POST('/api/v1/entities/{entityId}/links', {
        params: { path: { entityId: owner.id } },
        body: link,
        headers: describedAs(description),
      }),
    ),
  );
}

/** Changes a link's address, label or spoiler flag. */
export function updateLink(
  queryClient: QueryClient,
  owner: Owner,
  link: LinkRead,
  patch: LinkPatch,
  description: string,
) {
  return writeAspect(queryClient, [owner.kind], 'save the link', () =>
    unwrap(
      api.PATCH('/api/v1/entities/{entityId}/links/{linkId}', {
        params: { path: { entityId: owner.id, linkId: link.id } },
        body: patch,
        headers: describedAs(description),
      }),
    ),
  );
}

/** Removes a link. */
export function removeLink(
  queryClient: QueryClient,
  owner: Owner,
  link: LinkRead,
  description: string,
) {
  return writeAspect(queryClient, [owner.kind], 'remove the link', async () => {
    const { error } = await api.DELETE('/api/v1/entities/{entityId}/links/{linkId}', {
      params: { path: { entityId: owner.id, linkId: link.id } },
      headers: describedAs(description),
    });
    throwIfRefused(error);
  });
}
