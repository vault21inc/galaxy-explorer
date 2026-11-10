import { unwrap } from '@ge/api-client';
import { useQueryClient } from '@tanstack/react-query';
import { GripVertical, X } from 'lucide-react';
import { api } from '@/api/client.ts';
import { useViewPayload } from '@/api/hooks.ts';
import { useReadOptions } from '@/api/read-options.ts';
import { refreshAfterWrite } from '@/api/refresh.ts';
import { errorMessage } from '@/app/route-states.tsx';
import { Button } from '@/components/ui/button.tsx';
import { cn } from '@/lib/utils.ts';
import { labelText } from '@/render/labels/label-text.ts';
import { useEditor } from '@/state/editor.ts';
import { useSelection } from '@/state/selection.ts';
import { useSpoilerPolicy } from '@/state/spoilers.ts';
import { useToasts } from '@/state/toasts.ts';
import { useRowDrag } from '../config-table/use-row-drag.ts';
import type { SectionProps } from '../types.ts';
import { SectionHeading } from './section-heading.tsx';

/** The waypoints after moving the one at `from` to `to`, both indexes in the list. */
export function movedWaypoints(ids: readonly string[], from: number, to: number): string[] {
  const next = [...ids];
  const [moved] = next.splice(from, 1);
  if (moved !== undefined) next.splice(to, 0, moved);
  return next;
}

/**
 * The waypoints without the one at `index`. Its neighbours may then be the same object (a round
 * trip's turning point), which a route can't have twice in a row, so they merge into one.
 */
export function withoutWaypoint(ids: readonly string[], index: number): string[] {
  return ids.filter((_, at) => at !== index).filter((id, at, list) => list[at - 1] !== id);
}

/**
 * A route's waypoints, in order (M4-T7). Names come from the galaxy view already loaded for the
 * map, and selecting one selects the object. In edit mode each has a handle to drag it (or Arrow
 * Up and Down on the focused handle) and Remove; each change replaces the list in one batch.
 */
export function WaypointsSection({ entity }: SectionProps) {
  const ids = (entity.waypoints ?? []).map((waypoint) => waypoint.objectId);
  const mapId = (entity as { mapId?: string }).mapId;
  const view = useViewPayload('galaxy', mapId, useReadOptions());
  const policy = useSpoilerPolicy();
  const editing = useEditor((state) => state.editing);
  const queryClient = useQueryClient();
  const routeId = entity.id;

  const save = async (objectIds: string[], description: string) => {
    try {
      await unwrap(
        api.PUT('/api/v1/routes/{routeId}/waypoints', {
          params: { path: { routeId } },
          body: { objectIds },
          headers: { 'X-GE-Batch-Description': encodeURIComponent(description) },
        }),
      );
    } catch (error) {
      const reason = error instanceof Error ? errorMessage(error) : 'unknown error';
      useToasts.getState().show(`Couldn't change the waypoints: ${reason}`, 'error');
    } finally {
      await refreshAfterWrite(queryClient, [['route'], ['view']]);
    }
  };
  const nameOf = (objectId: string) => {
    const object = view.data?.objects.find((item) => item.id === objectId);
    return object ? labelText(object, policy) : 'Unknown object';
  };
  const { drag, handleProps, rowRef } = useRowDrag((from, to) => {
    void save(movedWaypoints(ids, from, to), `Reorder the waypoints of “${entity.namePlain}”`);
  });

  return (
    <section>
      <SectionHeading>Waypoints ({ids.length.toString()})</SectionHeading>
      {ids.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No waypoints yet. Select objects in order and choose Create route, or use the Route tool.
        </p>
      ) : (
        <ol aria-label="Waypoints" className="flex flex-col text-sm">
          {ids.map((objectId, index) => {
            const name = nameOf(objectId);
            const position = `${(index + 1).toString()}. `;
            return (
              <li
                // The same object may come twice (a round trip), so its place is the key.
                key={`${index.toString()}:${objectId}`}
                ref={rowRef(index)}
                className={cn(
                  'flex items-center gap-1 border-y-2 border-transparent',
                  drag !== null && drag.gap === index && drag.from !== index && 'border-t-primary',
                  drag !== null &&
                    drag.gap === ids.length &&
                    index === ids.length - 1 &&
                    drag.from !== index &&
                    'border-b-primary',
                  drag?.from === index && 'opacity-50',
                )}
              >
                {editing && (
                  <button
                    type="button"
                    data-keys="own"
                    aria-label={`Move ${name}`}
                    title="Drag, or use the arrow keys, to reorder"
                    className="flex h-6 w-5 cursor-grab touch-none items-center justify-center rounded text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none active:cursor-grabbing"
                    {...handleProps(index, ids.length)}
                  >
                    <GripVertical aria-hidden className="size-4" />
                  </button>
                )}
                <button
                  type="button"
                  className="min-w-0 flex-1 truncate py-0.5 text-left hover:text-primary"
                  onClick={() => {
                    useSelection.getState().select([objectId]);
                  }}
                >
                  <span className="text-muted-foreground tabular-nums">{position}</span>
                  {name}
                </button>
                {editing && (
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label={`Remove ${name} from the route`}
                    onClick={() => {
                      void save(
                        withoutWaypoint(ids, index),
                        `Remove “${name}” from “${entity.namePlain}”`,
                      );
                    }}
                  >
                    <X aria-hidden />
                  </Button>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
