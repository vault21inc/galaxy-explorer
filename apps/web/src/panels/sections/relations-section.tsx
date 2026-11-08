import { entityKinds, relationTypes, spoilerKeys, toPlainText } from '@ge/domain';
import { Redactable } from '@/richtext/redactable.tsx';
import { RichTextView } from '@/richtext/rich-text-view.tsx';
import type { SectionProps } from '../types.ts';
import { SectionHeading } from './section-heading.tsx';

/**
 * Relations (architecture.md §3.4): "Involved in" on a character, "People involved" on an
 * event, "Related to" both ways. The other end's name follows its own spoiler flags.
 */
export function RelationsSection({ entity }: SectionProps) {
  const relations = entity.relations ?? [];
  if (relations.length === 0) return null;
  return (
    <section>
      <SectionHeading>Relations</SectionHeading>
      <ul className="flex flex-col gap-1.5 text-sm">
        {relations.map((relation) => {
          const type = relationTypes[relation.relationType];
          const outgoing = relation.fromEntityId === entity.id;
          const label = outgoing
            ? type.label
            : 'inverseLabel' in type
              ? type.inverseLabel
              : type.label;
          const key = spoilerKeys.relation(relation.id);
          const other = relation.other;
          const otherKey = spoilerKeys.record(other.id);
          return (
            <li key={relation.id}>
              <span className="text-muted-foreground">{label}: </span>
              <Redactable flagged={relation.isSpoiler} revealKey={key} hiddenText={other.namePlain}>
                <Redactable
                  flagged={other.isSpoiler || other.nameSpoiler}
                  revealKey={otherKey}
                  hiddenText={other.namePlain}
                >
                  <span>{other.namePlain}</span>
                </Redactable>
                <span className="text-muted-foreground">
                  {' '}
                  ({entityKinds[other.kind].label.one.toLowerCase()})
                </span>
                {relation.role && (
                  <span className="block text-muted-foreground">
                    <Redactable
                      flagged={false}
                      revealKey={`${key}/role`}
                      hiddenText={toPlainText(relation.role)}
                    >
                      <RichTextView value={relation.role} fieldKey={`${key}/role`} inline />
                    </Redactable>
                  </span>
                )}
              </Redactable>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
