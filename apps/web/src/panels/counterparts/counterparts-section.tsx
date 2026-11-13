import type { components } from '@ge/api-client';
import { containerName } from '@/lib/container-name.ts';
import { useSpoilerPolicy } from '@/state/spoilers.ts';
import { viewNavigation } from '@/state/view-navigator.ts';
import { goToLocated } from '../relations/shown-where.ts';
import { SectionHeading } from '../sections/section-heading.tsx';
import type { SectionProps } from '../types.ts';

type Counterpart = components['schemas']['Counterpart'];

/**
 * "Same object on other maps" (M7-T5, D-17): the copies and originals of this entry made by
 * cloning maps, one per map. Choosing one opens that map where the entry is shown, selected:
 * an object in its parent's view (a planet in its system), a place or event wherever it's
 * located, anything else in the galaxy view.
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
                open(counterpart);
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

function open(counterpart: Counterpart): void {
  const { id, kind, map } = counterpart;
  if (kind === 'place' || kind === 'event') {
    void goToLocated(id, map.id);
    return;
  }
  const subject = kind === 'celestial_object' ? counterpart.parentId : null;
  viewNavigation.show(subject, { select: id, mapId: map.id });
}
