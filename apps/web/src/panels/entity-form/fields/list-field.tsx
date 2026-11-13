import { fieldSchemaIn } from '@ge/domain';
import { useId, useState } from 'react';
import { editDescription, type FieldProps, type PathFieldDef } from '../field-props.ts';
import { changesFor, valueAt, valueKey } from '../field-path.ts';
import { FieldRow, INPUT_CLASS } from './field-row.tsx';

/** "infobox_pop, population" ↔ ['infobox_pop', 'population']: trimmed, empty items dropped. */
export function parseList(text: string): string[] {
  return text
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item !== '');
}

/**
 * The `list` widget (M7-T1): a short list of words, typed comma-separated in one input, such as
 * a field definition's wiki aliases. Saved on blur or Enter when it changed and the record's
 * Zod schema accepts it; clearing it saves an empty list.
 */
export function ListField(props: FieldProps<PathFieldDef>) {
  const { field, schema: recordSchema, record, title, revision, save, compact } = props;
  const id = useId();
  const schema = fieldSchemaIn(recordSchema, field.path);
  const saved = valueAt(record, field.path);
  const items = Array.isArray(saved) ? saved.filter((item) => typeof item === 'string') : [];
  const [error, setError] = useState<string | null>(null);

  const commit = (raw: string) => {
    const next = parseList(raw);
    if (next.join('\u0000') === items.join('\u0000')) return;
    if (schema) {
      const result = schema.safeParse(next);
      if (!result.success) {
        setError(result.error.issues[0]?.message ?? 'Not a valid list.');
        return;
      }
    }
    setError(null);
    void save(changesFor(record, field.path, next), editDescription(title, field.label));
  };

  return (
    <FieldRow label={field.label} htmlFor={id} hint={field.hint} error={error} compact={compact}>
      <input
        // Remounted for a new saved value, which replaces what's typed.
        key={valueKey(saved, revision)}
        id={id}
        type="text"
        defaultValue={items.join(', ')}
        placeholder="Separated by commas"
        aria-invalid={error ? true : undefined}
        className={INPUT_CLASS}
        onBlur={(event) => {
          commit(event.currentTarget.value);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur();
        }}
      />
    </FieldRow>
  );
}
