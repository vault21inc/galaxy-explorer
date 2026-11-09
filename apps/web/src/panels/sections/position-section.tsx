import { useId } from 'react';
import { useSaveMove } from '@/editor/use-save-move.ts';
import { useEditor } from '@/state/editor.ts';
import type { SectionProps } from '../types.ts';
import { SectionHeading } from './section-heading.tsx';

const AXES = ['x', 'y', 'z'] as const;

/**
 * Typed coordinates (ux.md §5), in edit mode: x, y, z in the view's unit, light-years at the
 * top of the galaxy and system units inside a system. A changed field saves on Enter or when
 * focus leaves, through the same batch as a drag ("Moved 1 object").
 */
export function PositionSection(props: SectionProps) {
  const editing = useEditor((state) => state.editing);
  return editing ? <PositionFields {...props} /> : null;
}

function PositionFields({ entity }: SectionProps) {
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
    if (!Number.isFinite(value) || value === position[axis]) return;
    const next: [number, number, number] = [...position];
    next[axis] = value;
    save.mutate([{ id: entity.id, version: entity.version, position: next }]);
  };

  return (
    <section>
      <SectionHeading>Position ({unit})</SectionHeading>
      {/* Keyed by version, so saved or refreshed values replace what's typed. */}
      <div key={entity.version} className="grid grid-cols-3 gap-2">
        {AXES.map((axis, index) => (
          <label key={axis} htmlFor={`${id}-${axis}`} className="flex items-center gap-1.5 text-sm">
            <span className="text-muted-foreground uppercase">{axis}</span>
            <input
              id={`${id}-${axis}`}
              aria-label={`Position ${axis.toUpperCase()}`}
              type="number"
              step="any"
              defaultValue={position[index]}
              className="w-full min-w-0 rounded-md border border-input bg-transparent px-1.5 py-0.5"
              onBlur={(event) => {
                commit(index, event.currentTarget.value);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') event.currentTarget.blur();
              }}
            />
          </label>
        ))}
      </div>
    </section>
  );
}
