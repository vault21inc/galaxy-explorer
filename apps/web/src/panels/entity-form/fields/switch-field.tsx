import { useId, useState } from 'react';
import { Switch } from '@/components/ui/switch.tsx';
import { editDescription, type FieldProps, type PathFieldDef } from '../field-props.ts';
import { changesFor, valueAt } from '../field-path.ts';
import { FieldRow } from './field-row.tsx';

/** A boolean (`explorable`, `isSpoiler`), saved as soon as it's switched. */
export function SwitchField({ field, entity, save }: FieldProps<PathFieldDef>) {
  const id = useId();
  const saved = valueAt(entity, field.path) === true;
  // Shows the new state while it saves, instead of flicking back until the refetch.
  const [pending, setPending] = useState<boolean | null>(null);
  return (
    <FieldRow label={field.label} htmlFor={id} hint={field.hint}>
      <Switch
        id={id}
        checked={pending ?? saved}
        onCheckedChange={(checked) => {
          setPending(checked);
          void save(
            changesFor(entity, field.path, checked),
            editDescription(entity, field.label),
          ).finally(() => {
            setPending(null);
          });
        }}
      />
    </FieldRow>
  );
}
