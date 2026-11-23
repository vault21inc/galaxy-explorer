import { entityKinds, relationTypes, spoilerKeys, toPlainText } from '@ge/domain';
import { Redactable } from '@/richtext/redactable.tsx';
import { RichTextView } from '@/richtext/rich-text-view.tsx';
import { useEditor } from '@/state/editor.ts';
import { RelatedEditor } from '../relations/related-editor.tsx';
import { UNTYPED_RELATIONS } from '../relations/relation-sections.ts';
import type { SectionProps } from '../types.ts';
import { SectionHeading } from './section-heading.tsx';

/**
 * Relations open to any kind (architecture.md §3.4): "Related to", both ways. Typed ones, such
 * as an event's people, have sections of their own (relations/relation-section.tsx). The other
 * end's name follows its own spoiler flags. In edit mode, the editor
 * (relations/related-editor.tsx), shown even with nothing related yet.
 */
export function RelationsSection({ entity, kind }: SectionProps) {
  const editing = useEditor((state) => state.editing);
  const relations = (entity.relations ?? []).filter((relation) =>
    UNTYPED_RELATIONS.has(relation.relationType),
  );
  if (editing) {
    return (
      <section aria-label="Related to">
        <SectionHeading>Related to</SectionHeading>
        <RelatedEditor entity={entity} kind={kind} relations={relations} />
      </section>
    );
  }
  if (relations.length === 0) return null;
  return (
    <section aria-label="Relations">
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
