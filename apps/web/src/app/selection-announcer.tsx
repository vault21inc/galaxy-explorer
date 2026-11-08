import { objectTypes, type ViewObject } from '@ge/domain';
import { useSelection } from '@/state/selection.ts';
import { useSpoilers } from '@/state/spoilers.ts';

/**
 * Announces selection changes to screen readers (ux.md §10): "Selected Aster, System", or how
 * many are selected. Hidden spoiler names stay hidden here too.
 */
export function SelectionAnnouncer({ objects }: { objects: readonly ViewObject[] }) {
  const selectedIds = useSelection((state) => state.selectedIds);
  const showSpoilers = useSpoilers((state) => state.showSpoilers);
  let message = '';
  if (selectedIds.length === 1) {
    const object = objects.find((item) => item.id === selectedIds[0]);
    if (object) {
      const name = showSpoilers ? object.namePlain : object.nameRedacted;
      message = `Selected ${name}, ${objectTypes[object.baseType].label}`;
    }
  } else if (selectedIds.length > 1) {
    message = `${selectedIds.length.toString()} objects selected`;
  }
  return (
    <p aria-live="polite" className="sr-only">
      {message}
    </p>
  );
}
