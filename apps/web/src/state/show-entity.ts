import type { EntityKind } from '@ge/domain';
import { goToLocated } from '@/panels/relations/shown-where.ts';
import { useDetailsSheet } from './details-sheet.ts';
import { useSelection } from './selection.ts';
import { viewNavigation } from './view-navigator.ts';

/** What `showEntity` needs to know of an entry: what it is and where. */
export interface EntityPlace {
  id: string;
  kind: EntityKind;
  /** Null for universe-scoped entries (characters). */
  mapId: string | null;
  /** An object's parent; null otherwise. */
  parentId: string | null;
}

/**
 * Opens the view that shows an entry, with it selected, chaining the transitions (ux.md §9):
 * an object in its parent's view (a planet in its system's, a moon in its planet's), a place
 * or event wherever it's located (M6-T6), a group or route in the galaxy view. A character
 * has no place on a map: it's selected where the reader is, so its panel opens.
 *
 * Used by search results (M7-T6) and "On other maps" (M7-T5). Only a map page can move
 * between views; elsewhere the caller navigates by URL.
 *
 * The reader asked for this entry by name, so its details open, not only its card (D-58).
 */
export function showEntity(entity: EntityPlace): void {
  useDetailsSheet.getState().raise('half');
  if (entity.mapId === null) {
    useSelection.getState().select([entity.id]);
    return;
  }
  if (entity.kind === 'place' || entity.kind === 'event') {
    void goToLocated(entity.id, entity.mapId);
    return;
  }
  const subject = entity.kind === 'celestial_object' ? entity.parentId : null;
  viewNavigation.show(subject, { select: entity.id, mapId: entity.mapId });
}
