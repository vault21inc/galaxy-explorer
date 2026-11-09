import { spoilerKeys } from '@ge/domain';
import { RichTextView } from '@/richtext/rich-text-view.tsx';
import type { SectionProps } from '../types.ts';
import { KindLine } from './kind-line.tsx';

/** The entity's name, then what it is. In edit mode the form shows these instead. */
export function HeaderSection(props: SectionProps) {
  const { entity } = props;
  return (
    <header className="flex flex-col gap-1">
      <h2 className="text-lg leading-tight font-semibold">
        <RichTextView
          value={entity.name}
          fieldKey={spoilerKeys.field(spoilerKeys.record(entity.id), 'name')}
          inline
        />
      </h2>
      <KindLine {...props} />
    </header>
  );
}
