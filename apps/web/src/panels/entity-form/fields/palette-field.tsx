import { Plus, X } from 'lucide-react';
import { useState } from 'react';
import { useAppearancePreview } from '@/state/appearance-preview.ts';
import { editDescription, type FieldProps, type PathFieldDef } from '../field-props.ts';
import { changesFor, valueAt } from '../field-path.ts';
import { inheritedValue } from '../inherited.ts';
import { FieldRow, ResetButton } from './field-row.tsx';

const MIN_COLORS = 2;
const MAX_COLORS = 6;

/**
 * The `palette` widget (M6-T2): a planet's 2–6 colors, from the shore to the peaks (a gas
 * giant's bands). Until the author changes one, it shows the preset's colors, dimmed. Picking
 * previews the planet live (the appearance preview); the palette is saved, whole, when the
 * picker closes, or when a color is added or removed.
 */
export function PaletteField({
  field,
  record,
  title,
  subtypes,
  save,
  compact,
}: FieldProps<PathFieldDef>) {
  const inherited = inheritedValue(record, field.path, subtypes);
  const saved = valueAt(record, field.path);
  const stored = Array.isArray(saved) ? (saved as string[]) : null;
  const [live, setLive] = useState<string[] | null>(null);
  const colors = live ?? stored ?? (Array.isArray(inherited) ? (inherited as string[]) : []);
  const preview = useAppearancePreview.getState();

  const commit = async (next: string[] | undefined) => {
    await save(changesFor(record, field.path, next), editDescription(title, field.label));
    setLive(null);
    preview.clear(record.id, field.path);
  };

  return (
    <FieldRow
      label={field.label}
      hint={field.hint}
      inherited={stored === null && live === null}
      compact={compact}
    >
      <div className="flex flex-wrap items-center gap-1" role="group" aria-label={field.label}>
        {colors.map((color, index) => (
          <span key={index} className="group relative">
            <input
              type="color"
              aria-label={`${field.label} color ${(index + 1).toString()}`}
              value={color}
              className="h-7 w-8 cursor-pointer rounded border border-input bg-transparent p-0.5"
              onChange={(event) => {
                // Every move of the picker: preview it.
                const next = colors.map((value, i) =>
                  i === index ? event.currentTarget.value : value,
                );
                setLive(next);
                preview.show(record.id, field.path, next);
              }}
              ref={(element) => {
                if (!element) return;
                // The native `change` event: the picker closed on a color.
                const onCommit = () => {
                  const next = colors.map((value, i) => (i === index ? element.value : value));
                  void commit(next);
                };
                element.addEventListener('change', onCommit);
                return () => {
                  element.removeEventListener('change', onCommit);
                };
              }}
            />
            {colors.length > MIN_COLORS && (
              <button
                type="button"
                aria-label={`Remove ${field.label.toLowerCase()} color ${(index + 1).toString()}`}
                className="absolute -top-1.5 -right-1.5 hidden rounded-full bg-background p-0.5 text-muted-foreground shadow group-hover:block hover:text-foreground"
                onClick={() => {
                  void commit(colors.filter((_, i) => i !== index));
                }}
              >
                <X className="size-3" />
              </button>
            )}
          </span>
        ))}
        {colors.length < MAX_COLORS && (
          <button
            type="button"
            aria-label={`Add a ${field.label.toLowerCase()} color`}
            className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
            onClick={() => {
              void commit([...colors, colors.at(-1) ?? '#808080']);
            }}
          >
            <Plus className="size-4" />
          </button>
        )}
      </div>
      {stored !== null && (
        <ResetButton
          label={field.label}
          onReset={() => {
            void commit(undefined);
          }}
        />
      )}
    </FieldRow>
  );
}
