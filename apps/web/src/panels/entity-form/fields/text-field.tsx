import { fieldSchemaIn, numberLimits, unwrapField } from '@ge/domain';
import { useId, useState } from 'react';
import { editDescription, type FieldProps, type PathFieldDef } from '../field-props.ts';
import { changesFor, valueAt, valueKey } from '../field-path.ts';
import { inheritedValue } from '../inherited.ts';
import { FieldRow, INPUT_CLASS, ResetButton } from './field-row.tsx';

/**
 * The `text` and `number` widgets: one input, saved on blur or Enter when it changed and the
 * record's Zod schema accepts it (limits come from the schema). Clearing it saves null for a
 * nullable field, or removes the override of an appearance value, which then shows its
 * default again.
 */
export function TextField(props: FieldProps<PathFieldDef>) {
  const { field, schema: recordSchema, record, title, subtypes, revision, save, compact } = props;
  const id = useId();
  const isNumber = field.widget === 'number';
  const schema = fieldSchemaIn(recordSchema, field.path);
  const nullable = schema ? unwrapField(schema).nullable : false;
  const limits = numberLimits(schema);
  const saved = valueAt(record, field.path);
  const inherited = inheritedValue(record, field.path, subtypes);
  const isInherited = saved === undefined && inherited !== undefined;
  const [error, setError] = useState<string | null>(null);

  const commit = (raw: string) => {
    const trimmed = raw.trim();
    let value: unknown;
    if (trimmed === '') value = nullable ? null : undefined;
    else value = isNumber ? Number(trimmed) : trimmed;
    if (value === (saved ?? (nullable ? null : undefined))) return;
    if (value !== undefined && schema) {
      const result = schema.safeParse(value);
      if (!result.success) {
        setError(result.error.issues[0]?.message ?? 'Not a valid value.');
        return;
      }
    }
    setError(null);
    void save(changesFor(record, field.path, value), editDescription(title, field.label));
  };

  const shown = saved ?? '';
  return (
    <FieldRow
      label={field.label}
      htmlFor={id}
      hint={field.hint}
      error={error}
      inherited={isInherited}
      compact={compact}
    >
      <input
        // Remounted for a new saved value, which replaces what's typed.
        key={valueKey(saved, revision)}
        id={id}
        type={isNumber ? 'number' : 'text'}
        defaultValue={typeof shown === 'string' || typeof shown === 'number' ? shown : ''}
        placeholder={
          typeof inherited === 'number' || typeof inherited === 'string'
            ? String(inherited)
            : undefined
        }
        {...(isNumber
          ? {
              step: limits.integer ? 1 : 'any',
              ...(limits.min === undefined ? {} : { min: limits.min }),
              ...(limits.max === undefined ? {} : { max: limits.max }),
            }
          : {})}
        aria-invalid={error ? true : undefined}
        className={INPUT_CLASS}
        onBlur={(event) => {
          commit(event.currentTarget.value);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur();
        }}
      />
      {saved !== undefined && inherited !== undefined && (
        <ResetButton
          label={field.label}
          onReset={() => {
            void save(
              changesFor(record, field.path, undefined),
              editDescription(title, field.label),
            );
          }}
        />
      )}
    </FieldRow>
  );
}
