import { spoilerKeys, toPlainText } from '@ge/domain';
import { Redactable } from '@/richtext/redactable.tsx';
import { useEditor } from '@/state/editor.ts';
import { CitationNote, citationsFor } from '../citations/citation-note.tsx';
import { FactsEditor } from '../facts/facts-editor.tsx';
import { RichTextView } from '@/richtext/rich-text-view.tsx';
import type { PanelEntity, SectionProps } from '../types.ts';
import { SectionHeading } from './section-heading.tsx';

type Fact = NonNullable<PanelEntity['facts']>[number];

/**
 * Facts (U2): each field definition's label and this entity's value, in definition order, each
 * row blacked out while it's a hidden spoiler; facts without a value aren't shown. In edit mode,
 * the editor for every definition that applies (facts/facts-editor.tsx, M7-T1).
 */
export function FactsSection(props: SectionProps) {
  const { entity, fieldDefinitions } = props;
  const editing = useEditor((state) => state.editing);
  if (editing) {
    return (
      <section aria-label="Facts">
        <SectionHeading>Facts</SectionHeading>
        <FactsEditor {...props} />
      </section>
    );
  }
  const facts = entity.facts ?? [];
  if (facts.length === 0) return null;
  const definitions = new Map<string, (typeof fieldDefinitions)[number]>(
    fieldDefinitions.map((definition) => [definition.id, definition]),
  );
  const sorted = [...facts].sort(
    (a, b) =>
      (a.sortKey ?? definitions.get(a.fieldDefinitionId)?.sortKey ?? 0) -
      (b.sortKey ?? definitions.get(b.fieldDefinitionId)?.sortKey ?? 0),
  );
  return (
    <section aria-label="Facts">
      <SectionHeading>Facts</SectionHeading>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
        {sorted.map((fact) => {
          const definition = definitions.get(fact.fieldDefinitionId);
          const key = spoilerKeys.fact(entity.id, fact.fieldDefinitionId);
          return (
            <div key={fact.fieldDefinitionId} className="contents">
              <dt className="text-muted-foreground">{definition?.label ?? 'Fact'}</dt>
              <dd>
                <Redactable flagged={fact.isSpoiler} revealKey={key} hiddenText={factText(fact)}>
                  <FactValue fact={fact} unit={definition?.unit ?? null} revealKey={key} />
                </Redactable>
                {definition && (
                  <CitationNote
                    citations={citationsFor(entity, `field:${definition.key}`)}
                    what="From"
                  />
                )}
              </dd>
            </div>
          );
        })}
      </dl>
    </section>
  );
}

function factText(fact: Fact): string {
  const { value } = fact;
  switch (value.type) {
    case 'number':
      return value.number.toLocaleString();
    case 'text':
      return toPlainText(value.text);
    case 'date_text':
      return value.text;
    case 'url':
      return value.label ?? value.url;
  }
}

function FactValue({
  fact,
  unit,
  revealKey,
}: {
  fact: Fact;
  unit: string | null;
  revealKey: string;
}) {
  const { value } = fact;
  switch (value.type) {
    case 'number':
      return (
        <>
          {value.number.toLocaleString()}
          {unit && <span className="text-muted-foreground"> {unit}</span>}
        </>
      );
    case 'text':
      return <RichTextView value={value.text} fieldKey={revealKey} inline />;
    case 'date_text':
      return <>{value.text}</>;
    case 'url':
      return (
        <a
          href={value.url}
          target="_blank"
          rel="noopener noreferrer nofollow ugc"
          className="text-primary underline"
        >
          {value.label ?? value.url}
        </a>
      );
  }
}
