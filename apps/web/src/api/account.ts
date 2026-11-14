import { unwrap, type components } from '@ge/api-client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client.ts';

/**
 * The account page (M8-T13, ux.md §13): the password, signed-in devices, the media the
 * account's universes hold, and its API tokens (M8-T2).
 */

export type Session = components['schemas']['SessionRead'];
export type Storage = components['schemas']['StorageRead'];

const SESSIONS_KEY = ['auth', 'sessions'] as const;

export function useSessions() {
  return useQuery({
    queryKey: SESSIONS_KEY,
    queryFn: ({ signal }) => unwrap(api.GET('/api/v1/auth/sessions', { signal })),
  });
}

/** Signs one device out, or, with no id, every device but this one. */
export function useEndSessions() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (sessionId?: string) =>
      sessionId === undefined
        ? unwrap(api.DELETE('/api/v1/auth/sessions'))
        : unwrap(
            api.DELETE('/api/v1/auth/sessions/{sessionId}', { params: { path: { sessionId } } }),
          ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: SESSIONS_KEY }),
  });
}

export function useChangePassword() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { currentPassword: string; newPassword: string; totp: string }) =>
      unwrap(api.POST('/api/v1/auth/password', { body })),
    // Every other device was signed out.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: SESSIONS_KEY }),
  });
}

export function useStorage() {
  return useQuery({
    queryKey: ['auth', 'storage'],
    queryFn: ({ signal }) => unwrap(api.GET('/api/v1/auth/storage', { signal })),
  });
}

// ---- API tokens (M8-T2) --------------------------------------------------------------------

export type ApiToken = components['schemas']['ApiTokenRead'];
export type TokenScope = ApiToken['scope'];

const TOKENS_KEY = ['auth', 'tokens'] as const;

export function useTokens() {
  return useQuery({
    queryKey: TOKENS_KEY,
    queryFn: ({ signal }) => unwrap(api.GET('/api/v1/auth/tokens', { signal })),
  });
}

/** Makes a token, with a current code; the result holds the token itself, shown only once. */
export function useCreateToken() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      totp,
      ...body
    }: {
      name: string;
      scope: TokenScope;
      universeId: string | null;
      totp: string;
    }) => unwrap(api.POST('/api/v1/auth/tokens', { body, headers: { 'x-ge-totp': totp } })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: TOKENS_KEY }),
  });
}

export function useRevokeToken() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (tokenId: string) =>
      unwrap(api.DELETE('/api/v1/auth/tokens/{tokenId}', { params: { path: { tokenId } } })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: TOKENS_KEY }),
  });
}
