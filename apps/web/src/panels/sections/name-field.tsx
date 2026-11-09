import { rt, type EntityKind } from '@ge/domain';
import { useEffect, useId, useRef } from 'react';
import { useUpdateEntity } from '@/api/mutations.ts';
import { errorMessage } from '@/app/route-states.tsx';
import { useEditor } from '@/state/editor.ts';
import { useToasts } from '@/state/toasts.ts';
import type { PanelEntity } from '../types.ts';

/**
 * The name, editable in edit mode (M3-T2): saved on Enter or when focus leaves, if it changed.
 * Focused and selected when the object was just created, so typing renames it. M3-T4 replaces
 * this with the full rich-text field (formats, spoiler switch).
 */
export function NameField({ kind, entity }: { kind: EntityKind; entity: PanelEntity }) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const update = useUpdateEntity(kind);
  const focusNameOf = useEditor((state) => state.focusNameOf);
  const setFocusNameOf = useEditor((state) => state.setFocusNameOf);

  useEffect(() => {
    if (focusNameOf !== entity.id || !input.current) return;
    input.current.focus();
    input.current.select();
    setFocusNameOf(null);
  }, [focusNameOf, entity.id, setFocusNameOf]);

  const save = () => {
    const value = input.current?.value.trim() ?? '';
    if (value === '' || value === entity.namePlain) {
      if (input.current) input.current.value = entity.namePlain;
      return;
    }
    update.mutate(
      {
        id: entity.id,
        changes: { name: rt.plain(value), version: entity.version },
        description: `Rename ${entity.namePlain} to ${value}`,
      },
      {
        onError: (error) => {
          if (input.current) input.current.value = entity.namePlain;
          useToasts.getState().show(`Couldn't rename: ${errorMessage(error)}`, 'error');
        },
      },
    );
  };

  return (
    <>
      <label htmlFor={id} className="sr-only">
        Name
      </label>
      <input
        id={id}
        ref={input}
        // Keyed by version below, so a saved or refreshed name replaces what's typed.
        defaultValue={entity.namePlain}
        maxLength={200}
        className="w-full rounded-md border border-transparent bg-transparent px-1 py-0.5 text-lg font-semibold hover:border-input focus-visible:border-ring focus-visible:outline-none"
        onBlur={save}
        onKeyDown={(event) => {
          if (event.key === 'Enter') input.current?.blur();
          if (event.key === 'Escape') {
            if (input.current) input.current.value = entity.namePlain;
            input.current?.blur();
          }
        }}
      />
    </>
  );
}
