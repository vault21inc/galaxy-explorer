import { isHidden, redactionBar, spoilerKeys } from '@ge/domain';
import { Button } from '@/components/ui/button.tsx';
import { useSpoilerContext } from '@/richtext/spoiler-context.tsx';
import { sectionsFor } from './sections.ts';
import type { SectionProps } from './types.ts';

/**
 * One entity's details, section by section from the registry (architecture.md §3.5). A whole
 * entity hidden as a potential spoiler shows only a redacted title and a Reveal button
 * (ux.md §6). Presentational: the container (`EntityPanel`) loads the data.
 */
export function EntityDetails(props: SectionProps) {
  const { policy, reveal } = useSpoilerContext();
  const { entity } = props;
  const recordKey = spoilerKeys.record(entity.id);

  if (isHidden(entity.isSpoiler, recordKey, policy)) {
    return (
      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold" aria-label="Hidden title">
          <span aria-hidden className="rounded-[2px] bg-foreground/80 text-transparent select-none">
            {redactionBar(entity.namePlain)}
          </span>
        </h2>
        <p className="text-sm text-muted-foreground">This entry contains potential spoilers.</p>
        <Button
          variant="outline"
          size="sm"
          className="self-start"
          onClick={() => {
            reveal(recordKey);
          }}
        >
          Reveal
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {sectionsFor(props.kind).map(({ id, component: Section }) => (
        <Section key={id} {...props} />
      ))}
    </div>
  );
}
