import { Dices } from 'lucide-react';
import { useId, useState } from 'react';
import { editDescription, type FieldProps, type PathFieldDef } from '../field-props.ts';
import { changesFor, valueAt, valueKey } from '../field-path.ts';
import { FieldRow, INPUT_CLASS, ResetButton } from './field-row.tsx';

/** Seeds run from 0 to just under a million: short enough to read out and type back. */
const SEED_RANGE = 1_000_000;

/**
 * The `seed` widget (M6-T2): a planet's random seed, typed or rolled with the dice. The same
 * seed always gives the same planet. Without one, the planet's id picks its seed, so planets
 * differ from each other until the author chooses.
 */
export function SeedField({
  field,
  record,
  title,
  revision,
  save,
  compact,
}: FieldProps<PathFieldDef>) {
  const id = useId();
  const saved = valueAt(record, field.path);
  const [error, setError] = useState<string | null>(null);

  const commit = (next: number | undefined) => {
    if (next === saved) return;
    if (next !== undefined && !(Number.isInteger(next) && next >= 0 && next < SEED_RANGE)) {
      setError(`A seed is a whole number from 0 to ${(SEED_RANGE - 1).toLocaleString()}.`);
      return;
    }
    setError(null);
    void save(changesFor(record, field.path, next), editDescription(title, field.label));
  };

  return (
    <FieldRow
      label={field.label}
      htmlFor={id}
      hint={field.hint}
      error={error}
      inherited={saved === undefined}
      compact={compact}
    >
      <input
        key={valueKey(saved, revision)}
        id={id}
        type="number"
        step={1}
        min={0}
        max={SEED_RANGE - 1}
        defaultValue={typeof saved === 'number' ? saved : ''}
        placeholder="From its id"
        aria-invalid={error ? true : undefined}
        className={INPUT_CLASS}
        onBlur={(event) => {
          const raw = event.currentTarget.value.trim();
          commit(raw === '' ? undefined : Number(raw));
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur();
        }}
      />
      <button
        type="button"
        aria-label="Roll a new seed"
        title="Roll a new seed"
        className="shrink-0 rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
        onClick={() => {
          commit(Math.floor(Math.random() * SEED_RANGE));
        }}
      >
        <Dices className="size-4" />
      </button>
      {saved !== undefined && (
        <ResetButton
          label={field.label}
          onReset={() => {
            commit(undefined);
          }}
        />
      )}
    </FieldRow>
  );
}
