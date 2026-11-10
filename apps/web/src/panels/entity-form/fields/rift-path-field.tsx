import { MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button.tsx';
import { useRegionEdit } from '@/state/region-edit.ts';
import type { FieldProps, PathFieldDef } from '../field-props.ts';
import { valueAt } from '../field-path.ts';
import { FieldRow } from './field-row.tsx';

/**
 * A rift's points (M4-T6): how many it has, and the switch for adding more by clicking the map.
 * Points move by dragging their handles on the map, and Delete removes the selected one.
 */
export function RiftPathField({ field, record }: FieldProps<PathFieldDef>) {
  const path = (valueAt(record, field.path) ?? []) as unknown[];
  const adding = useRegionEdit((state) => state.addingPointsTo === record.id);
  const count = path.length;
  return (
    <FieldRow
      label={field.label}
      hint={
        adding
          ? 'Click the map to add points; Esc or Done to stop.'
          : 'Drag a point to move it; select one and press Delete to remove it.'
      }
    >
      <span className="text-sm">
        {count === 0
          ? 'A straight band'
          : `${count.toString()} ${count === 1 ? 'point' : 'points'}`}
      </span>
      <Button
        variant={adding ? 'secondary' : 'outline'}
        size="xs"
        aria-pressed={adding}
        onClick={() => {
          const edit = useRegionEdit.getState();
          if (adding) edit.stopAddingPoints();
          else edit.startAddingPoints(record.id);
        }}
      >
        <MapPin aria-hidden />
        {adding ? 'Done' : 'Add points'}
      </Button>
    </FieldRow>
  );
}
