import { entityKinds } from '@ge/domain';
import { useEffect, useState } from 'react';
import { useSearch, type SearchResult } from '@/api/search.ts';
import { PickerCombobox, type PickerOption } from './picker-combobox.tsx';

/** How long typing pauses before the words are searched, as in the command palette. */
const SEARCH_DELAY_MS = 150;

/**
 * A combobox over every entry in the universe, of any kind and on any map: the universe's
 * search (M7-T6), drafts and spoilers included, since only editors see it. For "Related to",
 * which links anything to anything; with no one kind to make, it offers no "Create".
 */
export function AnyEntityPicker({
  universeId,
  exclude,
  label,
  onPick,
}: {
  universeId: string;
  /** This entry and those already related: not offered. */
  exclude: ReadonlySet<string>;
  label: string;
  onPick: (result: SearchResult) => void;
}) {
  const [query, setQuery] = useState('');
  const [searched, setSearched] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearched(query);
    }, SEARCH_DELAY_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [query]);
  const search = useSearch(universeId, searched, { spoilers: 'include', includeDrafts: true });
  const results = query.trim() === '' ? [] : (search.data ?? []);
  const matches = results.filter((result) => !exclude.has(result.id));
  const options: PickerOption[] = matches.map((result) => ({
    key: result.id,
    text: result.name,
    // The kind and where it is (map, then system or planet), as the command palette shows them,
    // so two entries of the same name can be told apart.
    detail: [entityKinds[result.kind].label.one, result.path.join(' › ')]
      .filter((part) => part !== '')
      .join(' · '),
  }));
  return (
    <PickerCombobox
      label={label}
      placeholder="Add any entry…"
      query={query}
      onQuery={setQuery}
      options={options}
      onChoose={(option) => {
        const result = matches.find((match) => match.id === option.key);
        if (result) onPick(result);
      }}
    />
  );
}
