import type { ConfigReadOf, EntityKind } from '@ge/domain';
import { useQueryClient } from '@tanstack/react-query';
import { ExternalLink } from 'lucide-react';
import { useId, useState } from 'react';
import { sendBatch } from '@/api/batch.ts';
import { useConfigWrites } from '@/api/config-writes.ts';
import { refreshAfterWrite } from '@/api/refresh.ts';
import { errorMessage } from '@/app/route-states.tsx';
import { Button } from '@/components/ui/button.tsx';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog.tsx';
import { cn } from '@/lib/utils.ts';
import { useToasts } from '@/state/toasts.ts';
import { INPUT_CLASS } from '../entity-form/fields/field-row.tsx';
import { definitionsFor } from '../facts/facts-editor.tsx';
import type { PanelEntity } from '../types.ts';
import { fillDescription, fillOperations, fillPlan, type FillRow } from './fill-plan.ts';
import { useWikiPreview, useWikiSearch, useWikiSources } from './use-wiki.ts';

type Definition = ConfigReadOf<'field_definitions'>;

/**
 * "Fill from wiki" (M7-T3, ux.md §5):
 * 1. Search a configured wiki (the entity's name to start with), and choose a page.
 * 2. Compare: for the description and each fact the page's info box fills, what it says now
 *    and what the wiki says, each with a tick (an empty description and changed facts start
 *    ticked). Parameters that fill no field can become a field's wiki alias here.
 * 3. Apply: one batch with a citation per filled target ("Filled Gudrun from …"), undone in one
 *    step. Images are never copied: wiki artwork usually isn't covered by its text licence.
 */
export function WikiFillDialog({
  open,
  onOpenChange,
  kind,
  entity,
  fieldDefinitions,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kind: EntityKind;
  entity: PanelEntity;
  fieldDefinitions: readonly Definition[];
}) {
  const sources = useWikiSources().data ?? [];
  const [sourceId, setSourceId] = useState<string | undefined>(undefined);
  const source = sourceId ?? sources[0]?.id;
  const [title, setTitle] = useState<string | null>(null);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Fill {entity.namePlain} from a wiki</DialogTitle>
          <DialogDescription>
            Choose a page, then what to take from it. Each filled item names the page it came from.
          </DialogDescription>
        </DialogHeader>
        {title === null ? (
          <SearchStep
            sources={sources}
            source={source}
            onSource={setSourceId}
            initialQuery={entity.namePlain}
            onChoose={setTitle}
          />
        ) : (
          <PreviewStep
            source={source}
            title={title}
            kind={kind}
            entity={entity}
            definitions={definitionsFor(
              kind,
              {
                baseType:
                  'baseType' in entity && typeof entity.baseType === 'string'
                    ? entity.baseType
                    : null,
                subtypeId:
                  'subtypeId' in entity && typeof entity.subtypeId === 'string'
                    ? entity.subtypeId
                    : null,
              },
              fieldDefinitions,
            )}
            onBack={() => {
              setTitle(null);
            }}
            onDone={() => {
              setTitle(null);
              onOpenChange(false);
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function SearchStep({
  sources,
  source,
  onSource,
  initialQuery,
  onChoose,
}: {
  sources: readonly { id: string; label: string }[];
  source: string | undefined;
  onSource: (id: string) => void;
  initialQuery: string;
  onChoose: (title: string) => void;
}) {
  const id = useId();
  const [draft, setDraft] = useState(initialQuery);
  const [query, setQuery] = useState(initialQuery);
  const search = useWikiSearch(source, query);
  return (
    <div className="flex flex-col gap-3 text-sm">
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          setQuery(draft);
        }}
      >
        {sources.length > 1 && (
          <select
            aria-label="Wiki"
            className={cn(INPUT_CLASS, 'w-44')}
            value={source}
            onChange={(event) => {
              onSource(event.currentTarget.value);
            }}
          >
            {sources.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        )}
        <input
          id={`${id}-q`}
          type="search"
          aria-label="Search the wiki"
          className={cn(INPUT_CLASS, 'flex-1')}
          value={draft}
          onChange={(event) => {
            setDraft(event.currentTarget.value);
          }}
        />
        <Button type="submit" size="sm">
          Search
        </Button>
      </form>
      {search.isFetching ? (
        <p role="status" className="text-muted-foreground">
          Searching…
        </p>
      ) : search.error ? (
        <p role="alert" className="text-destructive">
          {errorMessage(search.error)}
        </p>
      ) : (search.data ?? []).length === 0 ? (
        <p className="text-muted-foreground">No pages found.</p>
      ) : (
        <ul aria-label="Wiki pages" className="flex flex-col gap-1">
          {(search.data ?? []).map((hit) => (
            <li key={hit.title}>
              <button
                type="button"
                className="w-full rounded px-2 py-1.5 text-left hover:bg-accent"
                onClick={() => {
                  onChoose(hit.title);
                }}
              >
                <span className="font-medium">{hit.title}</span>
                <span className="block truncate text-xs text-muted-foreground">{hit.snippet}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function PreviewStep({
  source,
  title,
  kind,
  entity,
  definitions,
  onBack,
  onDone,
}: {
  source: string | undefined;
  title: string;
  kind: EntityKind;
  entity: PanelEntity;
  definitions: readonly Definition[];
  onBack: () => void;
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const preview = useWikiPreview(source, title);
  const [templateIndex, setTemplateIndex] = useState(0);
  // Ticks the reader changed; the rest keep the plan's defaults.
  const [ticked, setTicked] = useState<Record<string, boolean>>({});
  const [applying, setApplying] = useState(false);
  const { update } = useConfigWrites('field_definitions', entity.universeId);

  if (preview.isPending) {
    return (
      <p role="status" className="text-sm text-muted-foreground">
        Reading {title}…
      </p>
    );
  }
  if (preview.error) {
    return (
      <div className="flex flex-col gap-2 text-sm">
        <p role="alert" className="text-destructive">
          {errorMessage(preview.error)}
        </p>
        <Button variant="ghost" size="sm" className="self-start" onClick={onBack}>
          Back to the search
        </Button>
      </div>
    );
  }
  const page = preview.data;
  const plan = fillPlan(page, templateIndex, entity, definitions);
  const isTicked = (row: FillRow) => ticked[row.target] ?? row.checked;
  const chosen = plan.rows.filter(isTicked);

  const addAlias = async (definition: Definition, param: string) => {
    try {
      await update(
        definition.id,
        { wikiAliases: [...definition.wikiAliases, param] },
        `Add wiki alias “${param}” to ${definition.label}`,
      );
    } catch (error) {
      useToasts
        .getState()
        .show(
          `Couldn't add the alias: ${error instanceof Error ? errorMessage(error) : ''}`,
          'error',
        );
    }
  };

  const apply = async () => {
    setApplying(true);
    try {
      await sendBatch({
        description: fillDescription(entity, page),
        operations: fillOperations(kind, entity, page, chosen) as never,
      });
      await refreshAfterWrite(queryClient, [[kind], ['view']]);
      useToasts.getState().show(fillDescription(entity, page), 'info');
      onDone();
    } catch (error) {
      useToasts
        .getState()
        .show(`Couldn't fill it: ${error instanceof Error ? errorMessage(error) : ''}`, 'error');
      setApplying(false);
    }
  };

  return (
    <div className="flex flex-col gap-3 text-sm">
      <p>
        <a
          href={page.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 font-medium text-primary underline underline-offset-2"
        >
          {page.title}
          <ExternalLink aria-hidden className="size-3" />
        </a>
        {page.redirectedFrom && (
          <span className="text-muted-foreground"> (from “{page.redirectedFrom}”)</span>
        )}
        {page.license && (
          <span className="text-muted-foreground"> · text under {page.license}</span>
        )}
      </p>
      {page.templates.length > 1 && (
        <label className="flex items-center gap-2">
          <span className="text-muted-foreground">Info box</span>
          <select
            aria-label="Info box"
            className={cn(INPUT_CLASS, 'w-56')}
            value={templateIndex}
            onChange={(event) => {
              setTemplateIndex(Number(event.currentTarget.value));
              setTicked({});
            }}
          >
            {page.templates.map((template, index) => (
              <option key={`${template.name}-${index.toString()}`} value={index}>
                {template.name}
              </option>
            ))}
          </select>
        </label>
      )}

      {plan.rows.length === 0 ? (
        <p className="text-muted-foreground">Nothing on this page fills a field of this entry.</p>
      ) : (
        <table aria-label="What to fill" className="w-full text-left">
          <thead className="text-xs text-muted-foreground">
            <tr>
              <th className="w-8 font-normal">
                <span className="sr-only">Fill</span>
              </th>
              <th className="font-normal">Field</th>
              <th className="font-normal">Now</th>
              <th className="font-normal">From the wiki</th>
            </tr>
          </thead>
          <tbody>
            {plan.rows.map((row) => (
              <tr key={row.target} className="align-top">
                <td className="py-1">
                  <input
                    type="checkbox"
                    aria-label={`Fill ${row.label}`}
                    checked={isTicked(row)}
                    onChange={(event) => {
                      const { checked } = event.currentTarget;
                      setTicked((current) => ({ ...current, [row.target]: checked }));
                    }}
                  />
                </td>
                <td className="py-1 pr-2 font-medium">{row.label}</td>
                <td className="max-w-40 py-1 pr-2 text-muted-foreground">
                  <span className="line-clamp-3">{row.current ?? '—'}</span>
                </td>
                <td className="max-w-56 py-1">
                  <span className="line-clamp-3">{row.wiki}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {plan.empty.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Nothing to fill for {plan.empty.map((item) => `${item.label} (${item.param})`).join(', ')}
          .
        </p>
      )}

      {plan.unmapped.length > 0 && definitions.length > 0 && (
        <details className="rounded border p-2">
          <summary className="cursor-pointer text-muted-foreground">
            {plan.unmapped.length} more {plan.unmapped.length === 1 ? 'value' : 'values'} in the
            info box
          </summary>
          <ul className="mt-2 flex flex-col gap-1">
            {plan.unmapped.map((param) => (
              <li key={param.name} className="flex items-center gap-2">
                <span className="w-32 shrink-0 truncate font-mono text-xs">{param.name}</span>
                <span className="min-w-0 flex-1 truncate">{param.text}</span>
                <select
                  aria-label={`Use ${param.name} for`}
                  className={cn(INPUT_CLASS, 'w-36')}
                  value=""
                  onChange={(event) => {
                    const definition = definitions.find(
                      (item) => item.id === event.currentTarget.value,
                    );
                    if (definition) void addAlias(definition, param.name);
                  }}
                >
                  <option value="">Use for…</option>
                  {definitions.map((definition) => (
                    <option key={definition.id} value={definition.id}>
                      {definition.label}
                    </option>
                  ))}
                </select>
              </li>
            ))}
          </ul>
        </details>
      )}

      <p className="text-xs text-muted-foreground">
        Images aren’t copied: wiki artwork usually isn’t covered by the text licence.{' '}
        <a href={page.url} target="_blank" rel="noopener noreferrer" className="underline">
          See the page’s images on the wiki
        </a>
        .
      </p>

      <div className="flex justify-between gap-2">
        <Button variant="ghost" size="sm" onClick={onBack}>
          Back to the search
        </Button>
        <Button
          size="sm"
          disabled={chosen.length === 0 || applying}
          onClick={() => {
            void apply();
          }}
        >
          {applying ? 'Filling…' : `Fill ${chosen.length.toString()}`}
        </Button>
      </div>
    </div>
  );
}
