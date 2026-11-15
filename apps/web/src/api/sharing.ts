import { unwrap, type components } from '@ge/api-client';
import type { MemberRole, Visibility } from '@ge/domain';
import { skipToken, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client.ts';
import { confirmationHeaders, type Confirmation } from './confirmation.ts';
import { refreshAfterWrite } from './refresh.ts';

/**
 * Sharing a universe (M8-T12, ux.md §13): its members, who can see it, its share link, handing
 * it over and deleting it. Owners change these; editors see them. With no accounts (your own
 * machine) only visibility and deletion mean anything, and no two-factor code is asked for.
 */

export type UniverseMember = components['schemas']['UniverseMemberRead'];

const membersKey = (universeId: string) => ['universe', 'members', universeId] as const;

/** After any of these, the universe (its visibility, key, owner, access) and lists may differ. */
const UNIVERSE_KEYS = [['universe']] as const;

/** The header a destructive action carries its fresh two-factor code in (M8-T1). */

export function useMembers(universeId: string | undefined) {
  return useQuery({
    queryKey: membersKey(universeId ?? ''),
    queryFn:
      universeId === undefined
        ? skipToken
        : ({ signal }) =>
            unwrap(
              api.GET('/api/v1/universes/{universeId}/members', {
                params: { path: { universeId } },
                signal,
              }),
            ),
  });
}

/** How many maps and entries are drafts: what stays hidden when the universe is made public. */
export function useDraftCount(universeId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['universe', 'drafts', universeId],
    queryFn: enabled
      ? ({ signal }) =>
          unwrap(
            api.GET('/api/v1/universes/{universeId}/drafts', {
              params: { path: { universeId } },
              signal,
            }),
          )
      : skipToken,
  });
}

export function useSetMember(universeId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ username, role }: { username: string; role: MemberRole }) =>
      unwrap(
        api.PUT('/api/v1/universes/{universeId}/members/{username}', {
          params: { path: { universeId, username } },
          body: { role },
        }),
      ),
    onSuccess: () => refreshAfterWrite(queryClient, [membersKey(universeId)]),
  });
}

export function useRemoveMember(universeId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (username: string) =>
      unwrap(
        api.DELETE('/api/v1/universes/{universeId}/members/{username}', {
          params: { path: { universeId, username } },
        }),
      ),
    onSuccess: () => refreshAfterWrite(queryClient, [membersKey(universeId)]),
  });
}

/** "Leave this universe": the signed-in member removes themself. */
export function useLeaveUniverse(universeId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      unwrap(
        api.DELETE('/api/v1/universes/{universeId}/membership', {
          params: { path: { universeId } },
        }),
      ),
    onSuccess: () => refreshAfterWrite(queryClient, UNIVERSE_KEYS),
  });
}

/** Private, link-only or public. Not content: no change batch, nothing to undo (D-41). */
export function useSetVisibility(universe: { id: string; version: number }) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (visibility: Visibility) =>
      unwrap(
        api.PATCH('/api/v1/universes/{universeId}', {
          params: { path: { universeId: universe.id } },
          body: { visibility, version: universe.version },
        }),
      ),
    onSuccess: () => refreshAfterWrite(queryClient, UNIVERSE_KEYS),
  });
}

/** "Make a new link": the old one stops working at once. */
export function useNewShareKey(universeId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      unwrap(
        api.POST('/api/v1/universes/{universeId}/share-key', {
          params: { path: { universeId } },
        }),
      ),
    onSuccess: () => refreshAfterWrite(queryClient, UNIVERSE_KEYS),
  });
}

export function useTransferUniverse(universeId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ username, confirmation }: { username: string; confirmation?: Confirmation }) =>
      unwrap(
        api.POST('/api/v1/universes/{universeId}/transfer', {
          params: { path: { universeId } },
          body: { username },
          headers: confirmationHeaders(confirmation),
        }),
      ),
    onSuccess: () => refreshAfterWrite(queryClient, [...UNIVERSE_KEYS, membersKey(universeId)]),
  });
}

export function useDeleteUniverse(universe: { id: string; version: number }) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ confirmation }: { confirmation?: Confirmation }) =>
      unwrap(
        api.DELETE('/api/v1/universes/{universeId}', {
          params: { path: { universeId: universe.id } },
          body: { version: universe.version },
          headers: confirmationHeaders(confirmation),
        }),
      ),
    // The page navigates away; only the lists need to forget it.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['universe', 'list'] }),
  });
}

/** A share link's full address: `/u/{slug}?k={key}` on this site. */
export function shareLinkOf(slug: string, shareKey: string): string {
  return `${window.location.origin}/u/${slug}?k=${encodeURIComponent(shareKey)}`;
}
