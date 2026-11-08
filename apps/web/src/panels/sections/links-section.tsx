import { RICH_TEXT_POLICY, spoilerKeys } from '@ge/domain';
import { ExternalLink } from 'lucide-react';
import { Redactable } from '@/richtext/redactable.tsx';
import type { SectionProps } from '../types.ts';
import { SectionHeading } from './section-heading.tsx';

/** External links (wikis, sources). A hidden link shows a bar instead of its label and URL. */
export function LinksSection({ entity }: SectionProps) {
  const links = entity.links ?? [];
  if (links.length === 0) return null;
  return (
    <section>
      <SectionHeading>Links</SectionHeading>
      <ul className="flex flex-col gap-1 text-sm">
        {links.map((link) => (
          <li key={link.id}>
            <Redactable
              flagged={link.isSpoiler}
              revealKey={spoilerKeys.link(entity.id, link.id)}
              hiddenText={link.label ?? link.url}
            >
              <a
                href={link.url}
                target={RICH_TEXT_POLICY.linkTarget}
                rel={RICH_TEXT_POLICY.linkRel}
                className="inline-flex items-center gap-1 text-primary underline underline-offset-2"
              >
                {link.label ?? link.url}
                <ExternalLink aria-hidden className="size-3" />
              </a>
            </Redactable>
          </li>
        ))}
      </ul>
    </section>
  );
}
