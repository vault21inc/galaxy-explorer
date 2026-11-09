import { fieldSchema } from '@ge/domain';
import { useEffect, useId, useRef, useState } from 'react';
import { editDescription, type FieldProps, type PathFieldDef } from '../field-props.ts';
import { changesFor, valueAt, valueKey } from '../field-path.ts';
import { inheritedValue } from '../inherited.ts';
import { FieldRow, INPUT_CLASS, ResetButton } from './field-row.tsx';

/**
 * A color: the browser's color picker beside the hex value, which can be typed. The picker
 * saves when it closes (its native `change` event; React's onChange fires on every move), the
 * text on blur or Enter. An inherited color is dimmed, an overridden one has Reset.
 */
export function ColorField({
  field,
  kind,
  entity,
  subtypes,
  revision,
  save,
}: FieldProps<PathFieldDef>) {
  const id = useId();
  const picker = useRef<HTMLInputElement>(null);
  const schema = fieldSchema(kind, field.path);
  const saved = valueAt(entity, field.path);
  const inherited = inheritedValue(entity, field.path, subtypes);
  const shown =
    typeof saved === 'string' ? saved : typeof inherited === 'string' ? inherited : '#ffffff';
  const [live, setLive] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const commit = (raw: string) => {
    const value = raw.trim().toLowerCase();
    setLive(null);
    if (value === '' || value === saved) return;
    const result = schema?.safeParse(value);
    if (result && !result.success) {
      setError('A color is # and six hex digits, such as #c8a24a.');
      return;
    }
    setError(null);
    void save(changesFor(entity, field.path, value), editDescription(entity, field.label));
  };

  // The picker's own `change` event: the color chosen when the picker closes.
  const commitRef = useRef(commit);
  useEffect(() => {
    commitRef.current = commit;
  });
  useEffect(() => {
    const element = picker.current;
    if (!element) return;
    const onChange = () => {
      commitRef.current(element.value);
    };
    element.addEventListener('change', onChange);
    return () => {
      element.removeEventListener('change', onChange);
    };
  }, []);

  return (
    <FieldRow
      label={field.label}
      htmlFor={id}
      hint={field.hint}
      error={error}
      inherited={saved === undefined && inherited !== undefined}
    >
      <input
        ref={picker}
        type="color"
        aria-label={`${field.label} picker`}
        value={live ?? shown}
        className="h-7 w-9 shrink-0 cursor-pointer rounded border border-input bg-transparent p-0.5"
        onChange={(event) => {
          setLive(event.currentTarget.value);
        }}
      />
      <input
        key={valueKey(saved, revision)}
        id={id}
        defaultValue={shown}
        spellCheck={false}
        aria-invalid={error ? true : undefined}
        className={`${INPUT_CLASS} font-mono`}
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
              changesFor(entity, field.path, undefined),
              editDescription(entity, field.label),
            );
          }}
        />
      )}
    </FieldRow>
  );
}
