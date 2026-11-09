import { useId } from 'react';
import { useSaveMove } from '@/editor/use-save-move.ts';
import type { FieldProps } from '../field-props.ts';
import { valueKey } from '../field-path.ts';
import { FieldRow, INPUT_CLASS } from './field-row.tsx';

const AXES = ['x', 'y', 'z'] as const;

/**
 * Typed coordinates (ux.md §5): x, y, z in the parent frame's unit, light-years at the top of
 * the galaxy and system units inside a system. A changed field saves on Enter or blur, through
 * the same batch as a drag ("Moved 1 object", M3-T3).
 */
export function PositionField({ field, entity, revision }: FieldProps) {
  const save = useSaveMove();
  const id = useId();
  const fields = entity as typeof entity & {
    x?: number;
    y?: number;
    z?: number;
    parentId?: string | null;
  };
  if (fields.x === undefined) return null;
  const position = [fields.x, fields.y ?? 0, fields.z ?? 0] as const;
  const unit = fields.parentId ? 'su' : 'ly';

  const commit = (axis: number, raw: string) => {
    const value = Number(raw);
    if (raw.trim() === '' || !Number.isFinite(value) || value === position[axis]) return;
    const next: [number, number, number] = [...position];
    next[axis] = value;
    save.mutate([{ id: entity.id, version: entity.version, position: next }]);
  };

  return (
    <FieldRow label={`${field.label} (${unit})`} htmlFor={`${id}-x`}>
      {/* Keyed by the saved position, so a saved or refreshed value replaces what's typed. */}
      <div key={valueKey(position, revision)} className="grid flex-1 grid-cols-3 gap-1.5">
        {AXES.map((axis, index) => (
          <input
            key={axis}
            id={`${id}-${axis}`}
            aria-label={`Position ${axis.toUpperCase()}`}
            type="number"
            step="any"
            defaultValue={position[index]}
            className={INPUT_CLASS}
            onBlur={(event) => {
              commit(index, event.currentTarget.value);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') event.currentTarget.blur();
            }}
          />
        ))}
      </div>
    </FieldRow>
  );
}
