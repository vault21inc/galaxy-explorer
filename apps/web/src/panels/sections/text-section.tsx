import { spoilerKeys } from '@ge/domain';
import { RichTextView } from '@/richtext/rich-text-view.tsx';
import { CitationNote, citationsFor } from '../citations/citation-note.tsx';
import type { SectionProps } from '../types.ts';

/**
 * How much of a long description the panel shows before "More": about two short paragraphs,
 * so the image, facts and links below stay in reach.
 */
const DESCRIPTION_PREVIEW_CHARS = 265;

/**
 * The summary or the description: one rich-text field (architecture.md §9), with the source it
 * was filled from beneath it, if any (M7-T3). A long description shows its start, with "More".
 */
export function textSection(field: 'summary' | 'description', className?: string) {
  function TextSection({ entity }: SectionProps) {
    const value = entity[field];
    if (!value || value.source.trim() === '') return null;
    return (
      <div className="flex flex-col gap-1">
        <RichTextView
          // A new entry starts folded again.
          key={entity.id}
          value={value}
          fieldKey={spoilerKeys.field(spoilerKeys.record(entity.id), field)}
          {...(className ? { className } : {})}
          {...(field === 'description' ? { maxChars: DESCRIPTION_PREVIEW_CHARS } : {})}
        />
        <CitationNote citations={citationsFor(entity, field)} />
      </div>
    );
  }
  TextSection.displayName = `TextSection(${field})`;
  return TextSection;
}
