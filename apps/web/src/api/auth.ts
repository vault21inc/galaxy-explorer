import { unwrap, type components } from '@ge/api-client';
import { skipToken, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEditor } from '@/state/editor.ts';
import { api } from './client.ts';
import { useHealth } from './health.ts';

/**
 * Signing in and account links (M8-T1, ux.md §13). Only when the API runs with
 * `GE_AUTH_MODE=required`; on your own machine there are no accounts and none of this shows.
 */

export type Account = components['schemas']['AccountRead'];
export type AccountLink = components['schemas']['AccountLinkRead'];
export type AccountLinkSetup = components['schemas']['AccountLinkSetup'];

const ACCOUNT_KEY = ['auth', 'me'] as const;

/** Whether this server has accounts at all. */
export function useAccountsEnabled(): boolean {
  return useHealth().data?.authMode === 'required';
}

/** The signed-in account: null when signed out, undefined while loading or without accounts. */
export function useAccount() {
  const enabled = useAccountsEnabled();
  return useQuery({
    queryKey: ACCOUNT_KEY,
    queryFn: enabled ? ({ signal }) => unwrap(api.GET('/api/v1/auth/me', { signal })) : skipToken,
    staleTime: Infinity,
  });
}

/**
 * After signing in or out, everything the API said may have changed: whether this reader may
 * edit (`/api/health`), and what they see. Refetching every query is simplest and rare enough.
 */
function useEverythingAgain() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries();
}

export function useSignIn() {
  const again = useEverythingAgain();
  return useMutation({
    mutationFn: (body: { username: string; password: string; totp: string }) =>
      unwrap(api.POST('/api/v1/auth/login', { body })),
    onSuccess: again,
  });
}

export function useSignOut() {
  const again = useEverythingAgain();
  const setAvailable = useEditor((state) => state.setAvailable);
  return useMutation({
    mutationFn: () => unwrap(api.POST('/api/v1/auth/logout')),
    onSuccess: async () => {
      // Edit mode goes at once, not when the health check comes back.
      setAvailable(false);
      await again();
    },
  });
}

/** What an invite or reset link is for, and whether it still works. */
export function useAccountLink(token: string) {
  return useQuery({
    queryKey: ['auth', 'link', token],
    queryFn: ({ signal }) =>
      unwrap(api.GET('/api/v1/auth/links/{token}', { params: { path: { token } }, signal })),
    retry: false,
  });
}

/** Step 1 of a link: the username (an invite) and password, for a two-factor setup. */
export function useStartLink(token: string) {
  return useMutation({
    mutationFn: (body: { username?: string; password: string }) =>
      unwrap(api.POST('/api/v1/auth/links/{token}/start', { params: { path: { token } }, body })),
  });
}

/** Step 2: the first code. The account is made (or reset) and this browser signed in. */
export function useFinishLink(token: string) {
  const again = useEverythingAgain();
  return useMutation({
    mutationFn: (body: { setup: string; totp: string }) =>
      unwrap(api.POST('/api/v1/auth/links/{token}/finish', { params: { path: { token } }, body })),
    onSuccess: again,
  });
}
