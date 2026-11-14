import { containerName } from '@/lib/container-name.ts';
import { useSpoilerPolicy } from '@/state/spoilers.ts';
import { showEntity } from '@/state/show-entity.ts';
import { SectionHeading } from '../sections/section-heading.tsx';
import type { SectionProps } from '../types.ts';

/**
 * "Same object on other maps" (M7-T5, D-17): the copies and originals of this entry made by
 * cloning maps, one per map. Choosing one opens that map where the entry is shown, selected
 * (showEntity).
 */
export function CounterpartsSection({ entity }: SectionProps) {
  const policy = useSpoilerPolicy();
  const counterparts = entity.counterparts ?? [];
  if (counterparts.length === 0) return null;
  return (
    <section aria-label="On other maps">
      <SectionHeading>On other maps</SectionHeading>
      <ul className="flex flex-col gap-0.5 text-sm">
        {counterparts.map((counterpart) => (
          <li key={counterpart.id}>
            <button
              type="button"
              className="text-left text-primary underline-offset-2 hover:underline"
              onClick={() => {
                showEntity({ ...counterpart, mapId: counterpart.map.id });
              }}
            >
              {containerName(counterpart.map, policy)}
              {counterpart.namePlain !== entity.namePlain && (
                <span className="text-muted-foreground"> · {counterpart.namePlain}</span>
              )}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
