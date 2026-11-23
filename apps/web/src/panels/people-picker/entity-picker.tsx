import { entityKinds, type EntityKind } from '@ge/domain';
import { useState } from 'react';
import { useEntityList } from '@/api/hooks.ts';
import { PickerCombobox, type PickerOption } from './picker-combobox.tsx';

/** How many matches the picker lists. */
const MATCHES = 8;

export type PickerScope = { universeId: string } | { mapId: string };

/**
 * A search-or-create combobox for one entity kind (M6-T6, ux.md §10): typing searches the kind
 * in `scope` by name (the list endpoint's `q`), and "Create “…”" is offered when no match has
 * exactly that name. Used for an event's people (characters in the universe) and a
 * character's events (events in the map).
 */
export function EntityPicker({
  kind,
  scope,
  exclude,
  label,
  onPick,
  onCreate,
}: {
  kind: EntityKind;
  scope: PickerScope | undefined;
  /** Already related: not offered again. */
  exclude: ReadonlySet<string>;
  label: string;
  onPick: (entity: { id: string; namePlain: string }) => void;
  onCreate: (name: string) => void;
}) {
  const [query, setQuery] = useState('');
  const needle = query.trim();
  // The scope's shape follows the kind, which is only known at run time here.
  const list = useEntityList(kind, (needle === '' ? undefined : scope) as never, {
    q: needle,
    limit: MATCHES + exclude.size,
  });
  const matches = (list.data?.data ?? [])
    .filter((entity) => !exclude.has(entity.id))
    .slice(0, MATCHES);
  const exact = matches.some((entity) => entity.namePlain.toLowerCase() === needle.toLowerCase());
  const options: PickerOption[] = [
    ...matches.map((entity) => ({ key: entity.id, text: entity.namePlain })),
    ...(needle !== '' && !exact
      ? [{ key: 'create', text: `Create “${needle}”`, create: true }]
      : []),
  ];
  return (
    <PickerCombobox
      label={label}
      placeholder={`Add ${entityKinds[kind].label.one.toLowerCase()}…`}
      query={query}
      onQuery={setQuery}
      options={options}
      onChoose={(option) => {
        if (option.create) {
          onCreate(needle);
          return;
        }
        const entity = matches.find((match) => match.id === option.key);
        if (entity) onPick(entity);
      }}
    />
  );
}
