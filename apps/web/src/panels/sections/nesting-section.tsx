import { useViewPayload } from '@/api/hooks.ts';
import { useReadOptions } from '@/api/read-options.ts';
import { labelText } from '@/render/labels/label-text.ts';
import { useSelection } from '@/state/selection.ts';
import { useSpoilerPolicy } from '@/state/spoilers.ts';
import type { SectionProps } from '../types.ts';
import { SectionHeading } from './section-heading.tsx';

/**
 * Where a group sits (M4-T4): the group it's inside and the groups inside it, from the galaxy
 * view already loaded for its map. Each selects that group, so the panel walks the nesting.
 */
export function NestingSection({ entity }: SectionProps) {
  const fields = entity as typeof entity & { mapId?: string; parentGroupId?: string | null };
  const view = useViewPayload('galaxy', fields.mapId, useReadOptions());
  const policy = useSpoilerPolicy();
  const groups = view.data?.groups ?? [];
  const parent = groups.find((group) => group.id === fields.parentGroupId);
  const children = groups
    .filter((group) => group.parentGroupId === entity.id)
    .map((group) => ({ id: group.id, name: labelText(group, policy) }))
    .toSorted((a, b) => a.name.localeCompare(b.name));
  if (!parent && children.length === 0) return null;

  const link = (id: string, name: string) => (
    <button
      type="button"
      className="text-left text-primary hover:underline"
      onClick={() => {
        useSelection.getState().select([id]);
      }}
    >
      {name}
    </button>
  );
  return (
    <section className="flex flex-col gap-2 text-sm">
      {parent && (
        <div>
          <SectionHeading>Inside</SectionHeading>
          {link(parent.id, labelText(parent, policy))}
        </div>
      )}
      {children.length > 0 && (
        <div>
          <SectionHeading>Groups inside ({children.length.toString()})</SectionHeading>
          <ul aria-label="Groups inside" className="flex flex-col gap-1">
            {children.map((child) => (
              <li key={child.id}>{link(child.id, child.name)}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
