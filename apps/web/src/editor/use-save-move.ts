import { unwrap } from '@ge/api-client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client.ts';
import { errorMessage } from '@/app/route-states.tsx';
import { setMovePreview } from '@/render/scene-index.ts';
import { useToasts } from '@/state/toasts.ts';

export interface Move {
  id: string;
  /** The version the editor read: a stale one fails the whole batch (architecture.md §5). */
  version: number;
  position: readonly [number, number, number];
}

/**
 * Saves a move (M3-T3): every moved object in one `POST /batch`, so the whole drag is one
 * change and one undo step ("Moved 3 objects"). The preview stays on screen until the views
 * have refetched, so nothing jumps; a failure ends the preview, which puts everything back,
 * and shows a toast.
 */
export function useSaveMove() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (moves: readonly Move[]) =>
      unwrap(
        api.POST('/api/v1/batch', {
          body: {
            description:
              moves.length === 1 ? 'Moved 1 object' : `Moved ${moves.length.toString()} objects`,
            operations: moves.map((move) => ({
              op: 'update' as const,
              kind: 'celestial_object' as const,
              id: move.id,
              version: move.version,
              data: { x: move.position[0], y: move.position[1], z: move.position[2] },
            })),
          },
        }),
      ),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['view'] }),
        queryClient.invalidateQueries({ queryKey: ['celestial_object'] }),
      ]);
      setMovePreview(null);
    },
    onError: (error) => {
      setMovePreview(null);
      useToasts.getState().show(`Couldn't move: ${errorMessage(error)}`, 'error');
    },
  });
}
