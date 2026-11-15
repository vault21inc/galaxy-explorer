import { RICH_TEXT_POLICY } from '@ge/domain';
import { ExternalLink } from 'lucide-react';
import type { SectionProps } from '../types.ts';
import { SectionHeading } from '../sections/section-heading.tsx';
import { latestRead } from './citation-note.tsx';

/**
 * Sources (M7-T3): every page this entity's content was filled from, with its licence and when
 * it was last read, one line per page. Under each cited text and fact, a note names its own
 * source.
 */
export function SourcesSection({ entity, fieldDefinitions }: SectionProps) {
  const citations = entity.citations ?? [];
  if (citations.length === 0) return null;
  const labels = new Map(
    fieldDefinitions.map((definition) => [`field:${definition.key}`, definition.label]),
  );
  const byPage = new Map<string, typeof citations>();
  for (const citation of citations) {
    byPage.set(citation.sourceUrl, [...(byPage.get(citation.sourceUrl) ?? []), citation]);
  }
  const targetName = (target: string) =>
    labels.get(target) ?? (target.startsWith('field:') ? target.slice(6) : target);
  return (
    <section aria-label="Sources">
      <SectionHeading>Sources</SectionHeading>
      <ul className="flex flex-col gap-1.5 text-sm">
        {[...byPage.entries()].map(([url, cited]) => {
          const [first] = cited;
          // The latest read, not the first citation's: a later fill from the same page (more
          // facts, say) read it again (from the owner's M7 demo).
          const read = latestRead(cited);
          return (
            <li key={url}>
              <a
                href={url}
                target={RICH_TEXT_POLICY.linkTarget}
                rel={RICH_TEXT_POLICY.linkRel}
                className="inline-flex items-center gap-1 text-primary underline underline-offset-2"
              >
                {first?.sourceTitle ?? url}
                <ExternalLink aria-hidden className="size-3" />
              </a>
              {first?.license && <span className="text-muted-foreground"> · {first.license}</span>}
              <span className="block text-xs text-muted-foreground">
                {cited.map((citation) => targetName(citation.target)).join(', ')}
                {read && ` · read ${new Date(read).toLocaleDateString()}`}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
