import { fieldSchemaIn, numberLimits } from '@ge/domain';
import { useId, useState } from 'react';
import { useAppearancePreview } from '@/state/appearance-preview.ts';
import { editDescription, type FieldProps, type PathFieldDef } from '../field-props.ts';
import { changesFor, valueAt } from '../field-path.ts';
import { inheritedValue } from '../inherited.ts';
import { FieldRow, ResetButton } from './field-row.tsx';

/** Steps across a slider's range, unless whole numbers are finer than that. */
const STEPS = 100;

/**
 * The `slider` widget (M6-T2): a number between its schema's limits, dragged. While it moves,
 * the value goes to the appearance preview, so the map redraws live (a planet re-bakes); it's
 * saved when let go (the input's native `change` event, which also follows each arrow-key
 * step), and the preview ends once the saved view has arrived.
 */
export function SliderField({
  field,
  schema: recordSchema,
  record,
  title,
  subtypes,
  save,
  compact,
}: FieldProps<PathFieldDef>) {
  const id = useId();
  const schema = fieldSchemaIn(recordSchema, field.path);
  const { min = 0, max = 1, integer } = numberLimits(schema);
  const range = max - min;
  const step = integer || range / STEPS >= 1 ? 1 : range / STEPS;
  const saved = valueAt(record, field.path);
  const inherited = inheritedValue(record, field.path, subtypes);
  const [live, setLive] = useState<number | null>(null);
  const value =
    live ?? (typeof saved === 'number' ? saved : typeof inherited === 'number' ? inherited : min);

  const preview = useAppearancePreview.getState();
  const commit = async (next: number) => {
    if (next === saved) {
      setLive(null);
      preview.clear(record.id, field.path);
      return;
    }
    await save(changesFor(record, field.path, next), editDescription(title, field.label));
    setLive(null);
    preview.clear(record.id, field.path);
  };

  return (
    <FieldRow
      label={field.label}
      htmlFor={id}
      hint={field.hint}
      inherited={saved === undefined && live === null}
      compact={compact}
    >
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        className="h-7 min-w-0 flex-1 accent-primary"
        onChange={(event) => {
          // React's onChange is the native `input` event: every move of the thumb.
          const next = event.currentTarget.valueAsNumber;
          setLive(next);
          preview.show(record.id, field.path, next);
        }}
        ref={(element) => {
          if (!element) return;
          // The native `change` event: the thumb was let go, or a key moved it a step.
          const onCommit = () => {
            void commit(element.valueAsNumber);
          };
          element.addEventListener('change', onCommit);
          return () => {
            element.removeEventListener('change', onCommit);
          };
        }}
      />
      <output htmlFor={id} className="w-10 shrink-0 text-right text-xs tabular-nums">
        {formatValue(value, step)}
      </output>
      {saved !== undefined && (
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

function formatValue(value: number, step: number): string {
  return step >= 1 ? Math.round(value).toString() : value.toFixed(2);
}
