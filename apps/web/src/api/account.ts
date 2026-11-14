import { unwrap, type components } from '@ge/api-client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client.ts';

/**
 * The account page (M8-T13, ux.md §13): the password, signed-in devices, and the media the
 * account's universes hold.
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
