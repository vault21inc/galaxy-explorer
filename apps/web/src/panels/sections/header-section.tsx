import { spoilerKeys } from '@ge/domain';
import { RichTextView } from '@/richtext/rich-text-view.tsx';
import type { SectionProps } from '../types.ts';
import { KindLine } from './kind-line.tsx';

/**
 * The entity's name, then what it is. It stays pinned at the top while the rest scrolls under
 * it: the panel's padding is pulled into it (-m), and it sticks that padding higher (-top-4),
 * since a sticky element stops at the scroll area's padding, so nothing shows above it.
 * In edit mode the form shows these instead.
 */
export function HeaderSection(props: SectionProps) {
  const { entity } = props;
  return (
    <header className="sticky -top-4 z-10 -mx-4 -mt-4 flex flex-col gap-1 border-b bg-card-solid px-4 pt-4 pb-3">
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
