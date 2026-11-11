/**
 * Moving between views from anywhere (rendering.md §4, ux.md §9): Esc, the breadcrumbs, the
 * test hooks and, from M5-T2, zooming. Each changes the URL; the view sync (use-view-sync.ts)
 * resolves the new URL and the transition controller animates the change, so a link, Back and
 * Forward all take the same path.
 *
 * The map page installs the navigator, which knows the current universe and map; elsewhere
 * these do nothing.
 */
export interface ViewNavigator {
  /** Opens an object's view, one level deeper (or selects it, if it doesn't open one). */
  enter: (objectId: string) => void;
  /** Goes up one view, back to where the camera was. */
  exit: () => void;
  /** Opens any object's view, or the galaxy view (null). */
  goTo: (objectId: string | null) => void;
  /**
   * Opens a view with something selected in it (M6-T6): an event's pin or marker, from a
   * character's events. `mapId` opens a view of another map of the universe.
   */
  show: (objectId: string | null, options: { select: string; mapId?: string | null }) => void;
  /**
   * Loads what an object's view needs before it's entered, once it's the zoom target
   * (rendering.md §4), so the swap behind the fade doesn't wait for the network.
   */
  prefetch: (objectId: string) => void;
}

let navigator: ViewNavigator | null = null;

export function setViewNavigator(next: ViewNavigator | null): void {
  navigator = next;
}

export const viewNavigation: ViewNavigator = {
  enter: (objectId) => navigator?.enter(objectId),
  exit: () => navigator?.exit(),
  goTo: (objectId) => navigator?.goTo(objectId),
  show: (objectId, options) => navigator?.show(objectId, options),
  prefetch: (objectId) => navigator?.prefetch(objectId),
};

/** `/u/{universe}/{map}` for the galaxy view, `…/view/{objectId}` for an object's (ux.md §9). */
export function viewPath(universeSlug: string, mapSlug: string, objectId: string | null): string {
  const map = `/u/${universeSlug}/${mapSlug}`;
  return objectId === null ? map : `${map}/view/${objectId}`;
}
