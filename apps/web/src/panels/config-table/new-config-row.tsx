import { configResources, configSchemasFor, fieldPaths, type ConfigResource } from '@ge/domain';
import { useEffect, useRef, useState } from 'react';
import { useConfigWrites } from '@/api/config-writes.ts';
import { errorMessage } from '@/app/route-states.tsx';
import { Button } from '@/components/ui/button.tsx';
import type { FormRecord, SaveFields } from '../entity-form/field-props.ts';
import { valueAt } from '../entity-form/field-path.ts';
import { widgetFor } from '../entity-form/widgets.ts';
import { recordTitle } from './record-title.ts';

/**
 * The row for a new setting (M4-T1): the same column widgets, saving into a local draft that
 * starts from the registry's `defaults`. Create checks the draft against the resource's create
 * schema and posts it; without a sort key the server puts it last.
 *
 * The registry's `derived` fields fill in from another as it's saved (a field definition's key
 * from its label, as the label's input is left), until they're typed in themselves.
 */
export function NewConfigRow({
  resource,
  universeId,
  onDone,
}: {
  resource: ConfigResource;
  universeId: string;
  onDone: () => void;
}) {
  const def = configResources[resource];
  const { create } = useConfigWrites(resource, universeId);
  const [draft, setDraft] = useState<Record<string, unknown>>(() => ({ ...def.defaults }));
  // The draft as of the last save: Create can follow a blur's save before React re-renders.
  const latest = useRef(draft);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const row = useRef<HTMLTableRowElement>(null);
  const one = def.label.one.toLowerCase();

  useEffect(() => {
    row.current?.querySelector<HTMLElement>('input, select')?.focus();
  }, []);

  // Derived fields typed in by hand: they no longer follow their source.
  const typed = useRef(new Set<string>());

  const record: FormRecord = { id: `new-${resource}`, universeId, ...draft };
  const save: SaveFields = (changes) => {
    const filled: Record<string, unknown> = {};
    for (const rule of 'derived' in def ? def.derived : []) {
      if (rule.path in changes) typed.current.add(rule.path);
      else if (rule.from in changes && !typed.current.has(rule.path)) {
        const source = changes[rule.from];
        filled[rule.path] =
          typeof source === 'string' ? rule.derive(source) || undefined : undefined;
      }
    }
    latest.current = { ...latest.current, ...changes, ...filled };
    setDraft(latest.current);
    return Promise.resolve({ ...record, ...latest.current });
  };

  const submit = async () => {
    // A field still being typed in saves on blur. Safari doesn't move focus to a clicked
    // button, so blur it here: its save lands in `latest` before the check.
    const focused = document.activeElement;
    if (focused instanceof HTMLElement && row.current?.contains(focused)) focused.blur();
    const parsed = configSchemasFor(resource).create.safeParse(latest.current);
    if (!parsed.success) {
      const [issue] = parsed.error.issues;
      const path = issue?.path.join('.') ?? '';
      const column = def.columns.find((item) => fieldPaths(item).includes(path));
      const label = column?.label ?? path;
      setError(
        valueAt(latest.current, path) === undefined
          ? `${label} is required.`
          : `${label}: ${issue?.message ?? 'not a valid value'}.`,
      );
      return;
    }
    setError(null);
    setCreating(true);
    try {
      await create(parsed.data, recordTitle(resource, latest.current));
      onDone();
    } catch (failure) {
      setError(failure instanceof Error ? errorMessage(failure) : 'Couldn’t create it.');
      setCreating(false);
    }
  };

  return (
    <tr ref={row} aria-label={`New ${one}`} className="[&>td]:border-y-2 [&>td]:border-transparent">
      <td />
      {def.columns.map((column) => {
        const Widget = widgetFor(column);
        return (
          <td key={fieldPaths(column).join(',')} className="min-w-28 px-1 align-top">
            <Widget
              field={column}
              schema={configSchemasFor(resource).update}
              record={record}
              universeId={universeId}
              title={recordTitle(resource, draft)}
              subtypes={[]}
              revision={0}
              save={save}
              compact
            />
          </td>
        );
      })}
      <td className="align-top">
        <div className="flex flex-col items-end gap-1">
          <div className="flex gap-1">
            <Button size="sm" disabled={creating} onClick={() => void submit()}>
              Create
            </Button>
            <Button size="sm" variant="ghost" onClick={onDone}>
              Cancel
            </Button>
          </div>
          {error && (
            <p role="alert" className="text-xs whitespace-nowrap text-destructive">
              {error}
            </p>
          )}
        </div>
      </td>
    </tr>
  );
}
