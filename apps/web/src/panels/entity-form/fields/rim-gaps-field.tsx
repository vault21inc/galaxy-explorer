import { fieldSchemaIn, type RimGap } from '@ge/domain';
import { Plus, X } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button.tsx';
import { editDescription, type FieldProps, type PathFieldDef } from '../field-props.ts';
import { changesFor, valueAt, valueKey } from '../field-path.ts';
import { FieldRow, INPUT_CLASS } from './field-row.tsx';

/** At most this many gaps (the schema's limit); a storm rarely needs more than one or two. */
const MAX_GAPS = 4;

/**
 * A storm's gaps in its rim (M4-T6), such as the Cadian Gate: each an angle around the disc and
 * a width, in degrees. Changes save as the whole list, checked against the schema.
 */
export function RimGapsField({
  field,
  schema,
  record,
  title,
  revision,
  save,
}: FieldProps<PathFieldDef>) {
  const saved = (valueAt(record, field.path) ?? []) as RimGap[];
  const [error, setError] = useState<string | null>(null);
  const commit = (gaps: RimGap[]) => {
    const result = fieldSchemaIn(schema, field.path)?.safeParse(gaps);
    if (result && !result.success) {
      setError(result.error.issues[0]?.message ?? 'Not a valid gap.');
      return;
    }
    setError(null);
    void save(changesFor(record, field.path, gaps), editDescription(title, field.label));
  };
  const number = (raw: string, fallback: number) => {
    const value = Number(raw);
    return raw.trim() === '' || !Number.isFinite(value) ? fallback : value;
  };

  return (
    <FieldRow label={field.label} error={error}>
      <div key={valueKey(saved, revision)} className="flex flex-1 flex-col gap-1">
        {saved.map((gap, index) => (
          <div key={index} className="flex items-center gap-1 text-xs text-muted-foreground">
            <input
              type="number"
              aria-label={`Gap ${(index + 1).toString()} angle (°)`}
              defaultValue={gap.angleDeg}
              step="any"
              className={INPUT_CLASS}
              onBlur={(event) => {
                const angleDeg = number(event.currentTarget.value, gap.angleDeg);
                if (angleDeg !== gap.angleDeg) {
                  commit(saved.map((item, i) => (i === index ? { ...item, angleDeg } : item)));
                }
              }}
            />
            °
            <input
              type="number"
              aria-label={`Gap ${(index + 1).toString()} width (°)`}
              defaultValue={gap.widthDeg}
              min={1}
              max={120}
              step="any"
              className={INPUT_CLASS}
              onBlur={(event) => {
                const widthDeg = number(event.currentTarget.value, gap.widthDeg);
                if (widthDeg !== gap.widthDeg) {
                  commit(saved.map((item, i) => (i === index ? { ...item, widthDeg } : item)));
                }
              }}
            />
            °
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={`Remove gap ${(index + 1).toString()}`}
              onClick={() => {
                commit(saved.filter((_, i) => i !== index));
              }}
            >
              <X aria-hidden />
            </Button>
          </div>
        ))}
        {saved.length < MAX_GAPS && (
          <Button
            variant="ghost"
            size="xs"
            className="self-start"
            onClick={() => {
              // A new gap opposite the last one, so it's visible straight away.
              const last = saved.at(-1)?.angleDeg ?? 0;
              commit([...saved, { angleDeg: (last + 180) % 360, widthDeg: 20 }]);
            }}
          >
            <Plus aria-hidden />
            Add gap
          </Button>
        )}
      </div>
    </FieldRow>
  );
}
