import { configResources, fieldPaths, type ConfigResource } from '@ge/domain';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { useConfigWrites } from '@/api/config-writes.ts';
import { useConfigList } from '@/api/hooks.ts';
import { errorMessage } from '@/app/route-states.tsx';
import { Button } from '@/components/ui/button.tsx';
import { useToasts } from '@/state/toasts.ts';
import { ConfigRow } from './config-row.tsx';
import { NewConfigRow } from './new-config-row.tsx';
import { recordTitle } from './record-title.ts';
import { reorderUpdates, type Ordered } from './reorder.ts';
import { useRowDrag } from './use-row-drag.ts';

/**
 * One universe settings table (M4-T1), generated for any config resource in the registry:
 * its columns, in-place editing with the form widgets, ordering by drag (`sortKey`), Add and
 * Delete. No resource has a table of its own: a new entry in `configResources` gets one.
 */
export function ConfigTable({
  resource,
  universeId,
}: {
  resource: ConfigResource;
  universeId: string;
}) {
  const def = configResources[resource];
  const one = def.label.one.toLowerCase();
  const list = useConfigList(resource, universeId);
  const { update, remove } = useConfigWrites(resource, universeId);
  const [adding, setAdding] = useState(false);
  const [moving, setMoving] = useState(false);
  const items = list.data ?? [];
  const headingId = `settings-${resource}`;

  const move = async (from: number, to: number) => {
    const ordered = items as unknown as Ordered[];
    const moved = ordered[from];
    if (!moved) return;
    const title = recordTitle(resource, moved as unknown as Record<string, unknown>);
    setMoving(true);
    try {
      // Usually one update; several only when rows shared a sort key (reorder.ts).
      for (const change of reorderUpdates(ordered, from, to)) {
        await update(change.id, { sortKey: change.sortKey }, `Reorder ${one} “${title}”`);
      }
    } catch (error) {
      useToasts.getState().show(`Couldn't reorder: ${errorMessage(error as Error)}`, 'error');
    } finally {
      setMoving(false);
    }
  };
  const { drag, handleProps, rowRef } = useRowDrag((from, to) => void move(from, to));

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-2">
      <h2 id={headingId} className="text-xs text-muted-foreground label-caps">
        {def.label.many}
      </h2>
      <div className="overflow-x-auto">
        <table aria-labelledby={headingId} aria-busy={moving} className="w-full border-collapse">
          <thead>
            <tr className="text-left text-xs text-muted-foreground">
              <th className="w-7 font-normal">
                <span className="sr-only">Order</span>
              </th>
              {def.columns.map((column) => (
                <th key={fieldPaths(column).join(',')} className="px-1 pb-1 font-normal">
                  {column.label}
                </th>
              ))}
              <th className="w-8 font-normal">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, index) => {
              const record = item as unknown as { id: string };
              return (
                <ConfigRow
                  key={record.id}
                  resource={resource}
                  item={item}
                  universeId={universeId}
                  rowRef={rowRef(index)}
                  handle={handleProps(index, items.length)}
                  dragging={drag?.from === index}
                  dropAbove={drag !== null && drag.gap === index && drag.from !== index}
                  dropBelow={
                    drag !== null &&
                    drag.gap === items.length &&
                    index === items.length - 1 &&
                    drag.from !== index
                  }
                  onDelete={async () => {
                    const title = recordTitle(resource, item);
                    try {
                      await remove(record.id, title);
                    } catch (error) {
                      useToasts
                        .getState()
                        .show(`Couldn't delete: ${errorMessage(error as Error)}`, 'error');
                    }
                  }}
                />
              );
            })}
            {adding && (
              <NewConfigRow
                resource={resource}
                universeId={universeId}
                onDone={() => {
                  setAdding(false);
                }}
              />
            )}
          </tbody>
        </table>
      </div>
      {list.isSuccess && items.length === 0 && !adding && (
        <p className="text-muted-foreground">No {def.label.many.toLowerCase()} yet.</p>
      )}
      {list.error && (
        <p role="alert" className="text-destructive">
          Couldn’t load the {def.label.many.toLowerCase()}: {errorMessage(list.error)}
        </p>
      )}
      {!adding && (
        <Button
          variant="outline"
          size="sm"
          className="self-start"
          onClick={() => {
            setAdding(true);
          }}
        >
          <Plus aria-hidden />
          Add {one}
        </Button>
      )}
    </section>
  );
}
