import { RICH_TEXT_POLICY } from '@ge/domain';
import type { PanelEntity } from '../types.ts';

export type Citation = NonNullable<PanelEntity['citations']>[number];

/** An entity's citations for one target (`description`, `field:population`), newest first. */
export function citationsFor(entity: PanelEntity, target: string): Citation[] {
  return (entity.citations ?? [])
    .filter((citation) => citation.target === target)
    .toSorted((a, b) => b.retrievedAt.localeCompare(a.retrievedAt));
}

/**
 * When a page was last read, of its citations: a fill that adds facts to an entity cited
 * before reads the page again, and that's the date to show. Undefined for no citations.
 */
export function latestRead(citations: readonly Citation[]): string | undefined {
  let latest: Citation | undefined;
  for (const citation of citations) {
    if (!latest || Date.parse(citation.retrievedAt) > Date.parse(latest.retrievedAt)) {
      latest = citation;
    }
  }
  return latest?.retrievedAt;
}

/**
 * "Text from Gudrun (CC-BY-SA)" under content filled from a wiki (M7-T3), linking to the page:
 * the licence asks for the source to be named wherever its text appears.
 */
export function CitationNote({
  citations,
  what = 'Text',
}: {
  citations: readonly Citation[];
  what?: string;
}) {
  if (citations.length === 0) return null;
  return (
    <p className="text-xs text-muted-foreground">
      {what === 'From' ? 'From' : `${what} from`}{' '}
      {citations.map((citation, index) => (
        <span key={citation.id}>
          {index > 0 && ', '}
          <a
            href={citation.sourceUrl}
            target={RICH_TEXT_POLICY.linkTarget}
            rel={RICH_TEXT_POLICY.linkRel}
            className="underline underline-offset-2 hover:text-foreground"
          >
            {citation.sourceTitle ?? citation.sourceUrl}
          </a>
          {citation.license && ` (${citation.license})`}
        </span>
      ))}
    </p>
  );
}
