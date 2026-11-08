import { spoilerKeys } from '@ge/domain';
import { RichTextView } from '@/richtext/rich-text-view.tsx';
import type { SectionProps } from '../types.ts';

/** The summary or the description: one rich-text field (architecture.md §9). */
export function textSection(field: 'summary' | 'description', className?: string) {
  function TextSection({ entity }: SectionProps) {
    const value = entity[field];
    if (!value || value.source.trim() === '') return null;
    return (
      <RichTextView
        value={value}
        fieldKey={spoilerKeys.field(spoilerKeys.record(entity.id), field)}
        {...(className ? { className } : {})}
      />
    );
  }
  TextSection.displayName = `TextSection(${field})`;
  return TextSection;
}
