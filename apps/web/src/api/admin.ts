import { unwrap, type components } from '@ge/api-client';
import type { SiteRole } from '@ge/domain';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client.ts';
import { confirmationHeaders, type Confirmation } from './confirmation.ts';

/**
 * The admin screens (M8-T13, ux.md §13): accounts, universes (facts about them, never their
 * content) and the access log. Destructive actions carry a confirmation: a current two-factor
 * code, or the password for an account with codes off (api/confirmation.ts, D-47).
 */

export type AdminUser = components['schemas']['AdminUserRead'];
export type AdminUniverse = components['schemas']['AdminUniverseRead'];
export type AccessEvent = components['schemas']['AccessEventRead'];

const ADMIN_KEY = ['admin'] as const;

export function useAdminUsers() {
  return useQuery({
    queryKey: [...ADMIN_KEY, 'users'],
    queryFn: ({ signal }) => unwrap(api.GET('/api/v1/admin/users', { signal })),
  });
}

export function useAdminUniverses() {
  return useQuery({
    queryKey: [...ADMIN_KEY, 'universes'],
    queryFn: ({ signal }) => unwrap(api.GET('/api/v1/admin/universes', { signal })),
  });
}

/** The access log, newest first, a page at a time. */
export function useAccessEvents() {
  return useInfiniteQuery({
    queryKey: [...ADMIN_KEY, 'events'],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) =>
      unwrap(
        api.GET('/api/v1/admin/events', {
          params: { query: { limit: 50, ...(pageParam ? { cursor: pageParam } : {}) } },
          signal,
        }),
      ),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

/** Every admin change touches the lists and the log: all of them are refreshed. */
function useAdminWrite<Input, Output>(write: (input: Input) => Promise<Output>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: write,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ADMIN_KEY }),
  });
}

export function useInvite() {
  return useAdminWrite((role: SiteRole) =>
    unwrap(api.POST('/api/v1/admin/invites', { body: { role } })),
  );
}

export function useResetLink() {
  return useAdminWrite(
    ({ userId, confirmation }: { userId: string; confirmation?: Confirmation }) =>
      unwrap(
        api.POST('/api/v1/admin/users/{userId}/reset-link', {
          params: { path: { userId } },
          headers: confirmationHeaders(confirmation),
        }),
      ),
  );
}

export interface AccountChange {
  userId: string;
  role?: SiteRole;
  disabled?: boolean;
  mediaQuotaBytes?: number;
  confirmation?: Confirmation;
}

export function useUpdateAccount() {
  return useAdminWrite(({ userId, confirmation, ...body }: AccountChange) =>
    unwrap(
      api.PATCH('/api/v1/admin/users/{userId}', {
        params: { path: { userId } },
        body,
        headers: confirmationHeaders(confirmation),
      }),
    ),
  );
}

export function useDeleteAccount() {
  return useAdminWrite(
    ({ userId, confirmation }: { userId: string; confirmation?: Confirmation }) =>
      unwrap(
        api.DELETE('/api/v1/admin/users/{userId}', {
          params: { path: { userId } },
          headers: confirmationHeaders(confirmation),
        }),
      ),
  );
}

export function useUpdateAdminUniverse() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      universeId,
      confirmation,
      ...body
    }: { universeId: string; confirmation?: Confirmation } & (
      { owner: string } | { visibility: 'private' }
    )) =>
      unwrap(
        api.PATCH('/api/v1/admin/universes/{universeId}', {
          params: { path: { universeId } },
          body,
          headers: confirmationHeaders(confirmation),
        }),
      ),
    // The universe's owner or visibility changed: the admin's own lists too.
    onSuccess: () => queryClient.invalidateQueries(),
  });
}

export function useDeleteAdminUniverse() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      universeId,
      confirmation,
    }: {
      universeId: string;
      confirmation?: Confirmation;
    }) =>
      unwrap(
        api.DELETE('/api/v1/admin/universes/{universeId}', {
          params: { path: { universeId } },
          headers: confirmationHeaders(confirmation),
        }),
      ),
    onSuccess: () => queryClient.invalidateQueries(),
  });
}
