import { isHidden, redactionBar, spoilerKeys, type EntityKind } from '@ge/domain';
import type { ReactNode } from 'react';
import { useConfigList, useEntity } from '@/api/hooks.ts';
import { useReadOptions } from '@/api/read-options.ts';
import { RichTextView } from '@/richtext/rich-text-view.tsx';
import { useSpoilerContext } from '@/richtext/spoiler-context.tsx';
import { KindLine } from './sections/kind-line.tsx';
import { includesFor } from './sections.ts';
import type { PanelEntity } from './types.ts';

/**
 * The details in brief (docs/plan/later/phone-usability.md, "The details sheet's three stops",
 * D-58): the name, what it is, and one line of its summary. On a phone it's what a tap on the
 * map shows, so the map stays in view; the side panel shows it, without the summary, when
 * collapsed.
 *
 * The name shows at once, from the view's own row (`fallbackName`, already blacked out where
 * the spoiler rules say). The rest comes with the entry, by the same query the full panel
 * makes (`EntityPanel`), so it's fetched once. The name and summary are rendered as the panel
 * renders them, so a spoiler is hidden, and revealed, by the same code.
 */
export function DetailsCard({
  kind,
  id,
  universeId,
  fallbackName,
  withSummary,
}: {
  kind: EntityKind;
  id: string;
  universeId: string;
  fallbackName: string | null;
  withSummary: boolean;
}) {
  const readOptions = useReadOptions();
  const loaded = useEntity(kind, id, { ...readOptions, include: includesFor(kind) }).data;
  const entity = loaded as PanelEntity | undefined;
  const subtypes = useConfigList('object_subtypes', universeId).data ?? [];
  const { policy } = useSpoilerContext();
  const recordKey = spoilerKeys.record(id);

  if (!entity) return <CardFrame name={fallbackName ?? 'Loading…'} />;
  if (isHidden(entity.isSpoiler, recordKey, policy)) {
    return (
      <CardFrame
        name={
          <span aria-hidden className="rounded-[2px] bg-foreground/80 text-transparent select-none">
            {redactionBar(entity.namePlain)}
          </span>
        }
        nameLabel="Hidden title"
      />
    );
  }
  const summary = entity.summary;
  return (
    <CardFrame
      name={
        <RichTextView value={entity.name} fieldKey={spoilerKeys.field(recordKey, 'name')} inline />
      }
    >
      <KindLine kind={kind} entity={entity} subtypes={subtypes} />
      {withSummary && summary && summary.source.trim() !== '' && (
        <p className="truncate text-sm text-foreground/80">
          <RichTextView value={summary} fieldKey={spoilerKeys.field(recordKey, 'summary')} inline />
        </p>
      )}
    </CardFrame>
  );
}

/** The card for several selected items: how many. */
export function SelectionCard({ count }: { count: number }) {
  return <CardFrame name={`${String(count)} selected`} />;
}

function CardFrame({
  name,
  nameLabel,
  children,
}: {
  name: ReactNode;
  nameLabel?: string;
  children?: ReactNode;
}) {
  return (
    <div data-testid="details-card" className="flex min-w-0 flex-1 flex-col gap-0.5 py-1 pl-2">
      <h2 className="truncate text-base leading-tight font-semibold" aria-label={nameLabel}>
        {name}
      </h2>
      {children}
    </div>
  );
}
