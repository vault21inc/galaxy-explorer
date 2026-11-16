import { unwrap } from '@ge/api-client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { api } from '@/api/client.ts';
import { useToasts } from '@/state/toasts.ts';
import { useTour } from './tour-store.ts';

/**
 * Starting the editor tour (M8-T10): a practice universe of the demo's content, made by the
 * API and private to the account (`POST /api/v1/practice-universe`), then its map, where the
 * tour begins once the reader may edit it (tour-layer.tsx waits for that).
 */
export function useStartEditorTour() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => unwrap(api.POST('/api/v1/practice-universe', {})),
    onSuccess: async ({ universe, mapSlug }) => {
      // The lists gain it: the home page's "Your universes" and the switcher.
      await queryClient.invalidateQueries({ queryKey: ['universe', 'list'] });
      useTour.getState().prepare('editor', { universeId: universe.id, slug: universe.slug });
      await navigate(`/u/${universe.slug}/${mapSlug}`);
    },
    onError: () => {
      useToasts.getState().show('Couldn’t make a practice universe. Try again.', 'error');
    },
  });
}
