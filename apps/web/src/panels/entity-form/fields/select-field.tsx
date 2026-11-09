import { CONFIG_RESOURCES, fieldSchema, unwrapField, type ConfigResource } from '@ge/domain';
import { useId, useState } from 'react';
import { useConfigList } from '@/api/hooks.ts';
import { editDescription, type FieldProps } from '../field-props.ts';
import { changesFor, valueAt } from '../field-path.ts';
import type { FormFieldDef } from '@ge/domain';
import { FieldRow, INPUT_CLASS } from './field-row.tsx';

type SelectFieldDef = Extract<FormFieldDef, { widget: 'select' }>;

/** The empty choice of a nullable reference. */
const NONE = '';

/**
 * A choice from fixed values (status) or from a universe setting (subtypes, group types,
 * event categories), saved as soon as it changes. Nullable fields offer "None".
 */
export function SelectField({ field, kind, entity, save }: FieldProps<SelectFieldDef>) {
  const id = useId();
  const { options } = field;
  const resource =
    options.from === 'config' && (CONFIG_RESOURCES as readonly string[]).includes(options.resource)
      ? (options.resource as ConfigResource)
      : undefined;
  const items = useConfigList(
    resource ?? 'object_subtypes',
    resource ? entity.universeId : undefined,
  );
  const schema = fieldSchema(kind, field.path);
  const nullable = schema ? unwrapField(schema).nullable : false;
  const saved = valueAt(entity, field.path);
  const [pending, setPending] = useState<string | null>(null);

  let choices: { value: string; label: string }[];
  if (options.from === 'values') {
    choices = options.values.map((value) => ({ value, label: options.labels?.[value] ?? value }));
  } else {
    const match = options.matchField;
    choices = (items.data ?? [])
      .filter(
        (item) => !match || (item as Record<string, unknown>)[match] === valueAt(entity, match),
      )
      .map((item) => {
        const record = item as Record<string, unknown>;
        return {
          value: String(record.id),
          label: String(record.name ?? record.label ?? record.id),
        };
      });
  }

  return (
    <FieldRow label={field.label} htmlFor={id} hint={field.hint}>
      <select
        id={id}
        className={INPUT_CLASS}
        value={pending ?? (typeof saved === 'string' ? saved : NONE)}
        onChange={(event) => {
          const value = event.currentTarget.value;
          setPending(value);
          void save(
            changesFor(entity, field.path, value === NONE ? null : value),
            editDescription(entity, field.label),
          ).finally(() => {
            setPending(null);
          });
        }}
      >
        {(nullable || saved == null) && <option value={NONE}>None</option>}
        {choices.map((choice) => (
          <option key={choice.value} value={choice.value}>
            {choice.label}
          </option>
        ))}
      </select>
    </FieldRow>
  );
}
