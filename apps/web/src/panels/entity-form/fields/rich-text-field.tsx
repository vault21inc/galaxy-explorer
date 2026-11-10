import { spoilerKeys, toPlainText, type RichText } from '@ge/domain';
import { useEffect, useState } from 'react';
import { removedMarkup } from '@/richtext/editor/removed-markup.ts';
import { RichTextEditor } from '@/richtext/editor/rich-text-editor.tsx';
import { useEditor } from '@/state/editor.ts';
import { editDescription, type FieldProps, type PathFieldDef } from '../field-props.ts';
import { valueAt, valueKey } from '../field-path.ts';

/**
 * The `name` and `richText` widgets: a rich-text editor (ux.md §8) saved on blur. A just-created
 * object's name takes focus (M3-T2). HTML comes back sanitized; if the server removed anything,
 * a note under the field says what.
 */
export function RichTextField({ field, record, title, revision, save }: FieldProps<PathFieldDef>) {
  const value = (valueAt(record, field.path) ?? null) as RichText | null;
  const isName = field.widget === 'name';
  const focusNameOf = useEditor((state) => state.focusNameOf);
  const setFocusNameOf = useEditor((state) => state.setFocusNameOf);
  const [removed, setRemoved] = useState<readonly string[]>([]);
  const autoFocus = isName && focusNameOf === record.id;

  // The editor focused itself on mount (its effect runs first); don't do it again.
  useEffect(() => {
    if (autoFocus) setFocusNameOf(null);
  }, [autoFocus, setFocusNameOf]);

  const commit = async (next: RichText | null) => {
    const description =
      isName && next
        ? `Rename “${title}” to “${toPlainText(next)}”`
        : editDescription(title, field.label);
    const saved = await save({ [field.path]: next }, description);
    const after = saved ? ((valueAt(saved, field.path) ?? null) as RichText | null) : null;
    setRemoved(
      saved && next?.format === 'html' && after ? removedMarkup(next.source, after.source) : [],
    );
  };

  return (
    <div className="flex flex-col gap-1">
      <RichTextEditor
        key={valueKey(value, revision)}
        label={field.label}
        value={value}
        singleLine={isName}
        nullable={!isName}
        fieldKey={spoilerKeys.field(spoilerKeys.record(record.id), field.path)}
        {...(field.hint ? { hint: field.hint } : {})}
        autoFocus={autoFocus}
        onCommit={(next) => {
          void commit(next);
        }}
      />
      {removed.length > 0 && (
        <p role="status" className="text-xs text-amber-300">
          Not allowed, so removed on save: {removed.join(', ')}.
        </p>
      )}
    </div>
  );
}
