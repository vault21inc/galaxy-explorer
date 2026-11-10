import {
  configResources,
  configSchemasFor,
  fieldPaths,
  type ConfigReadOf,
  type ConfigResource,
} from '@ge/domain';
import { GripVertical, Trash2 } from 'lucide-react';
import { useState, type ComponentProps } from 'react';
import { Button } from '@/components/ui/button.tsx';
import { cn } from '@/lib/utils.ts';
import type { FormRecord } from '../entity-form/field-props.ts';
import { widgetFor } from '../entity-form/widgets.ts';
import { DeleteConfigDialog } from './delete-config-dialog.tsx';
import { recordTitle } from './record-title.ts';
import { useConfigRowSave } from './use-config-row-save.ts';

/**
 * One settings row (M4-T1): a drag handle, one cell per registry column drawn by the form
 * widgets in their compact form, each saving on its own, and Delete.
 */
export function ConfigRow({
  resource,
  item,
  universeId,
  rowRef,
  handle,
  dragging,
  dropAbove,
  dropBelow,
  onDelete,
}: {
  resource: ConfigResource;
  item: ConfigReadOf<ConfigResource>;
  universeId: string;
  rowRef: (element: HTMLTableRowElement | null) => void;
  handle: ComponentProps<'button'>;
  dragging: boolean;
  /** A drag would drop the row into the gap above (or below) this one. */
  dropAbove: boolean;
  dropBelow: boolean;
  onDelete: () => Promise<void>;
}) {
  const def = configResources[resource];
  const record = item as unknown as FormRecord;
  const title = recordTitle(resource, record);
  const { save, revision } = useConfigRowSave(resource, universeId, record.id);
  const [confirming, setConfirming] = useState(false);

  return (
    <tr
      ref={rowRef}
      aria-label={title}
      className={cn(
        // Transparent borders keep the drop line from shifting the rows.
        '[&>td]:border-y-2 [&>td]:border-transparent',
        dropAbove && '[&>td]:border-t-primary',
        dropBelow && '[&>td]:border-b-primary',
        dragging && 'opacity-50',
      )}
    >
      <td className="w-7 align-top">
        <button
          type="button"
          aria-label={`Move ${title}`}
          title="Drag, or use the arrow keys, to reorder"
          className="flex h-7 w-6 cursor-grab touch-none items-center justify-center rounded text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none active:cursor-grabbing"
          {...handle}
        >
          <GripVertical aria-hidden className="size-4" />
        </button>
      </td>
      {def.columns.map((column) => {
        const Widget = widgetFor(column);
        return (
          <td key={fieldPaths(column).join(',')} className="min-w-28 px-1 align-top">
            <Widget
              field={column}
              schema={configSchemasFor(resource).update}
              record={record}
              universeId={universeId}
              title={title}
              subtypes={[]}
              revision={revision}
              save={save}
              compact
            />
          </td>
        );
      })}
      <td className="w-8 align-top">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Delete ${title}`}
          onClick={() => {
            setConfirming(true);
          }}
        >
          <Trash2 aria-hidden />
        </Button>
        <DeleteConfigDialog
          open={confirming}
          what={def.label.one.toLowerCase()}
          title={title}
          onCancel={() => {
            setConfirming(false);
          }}
          onConfirm={() => {
            setConfirming(false);
            void onDelete();
          }}
        />
      </td>
    </tr>
  );
}
