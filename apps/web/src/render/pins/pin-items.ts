import {
  isHidden,
  latLonToUnitVector,
  spoilerKeys,
  type ConfigReadOf,
  type SpoilerPolicy,
  type ViewPin,
} from '@ge/domain';
import type { DrawnState } from '../scene-index.ts';
import {
  PIN_AT_BODY_LAT_DEG,
  PIN_FAN_DEG,
  PIN_EVENT_COLOR,
  PIN_EVENT_ICON,
  PIN_LIFT_RADII,
  PIN_PLACE_COLOR,
  PIN_PLACE_ICON,
} from '../tuning.ts';

const DEG = Math.PI / 180;

/** The two pin shapes: an event's round pin, a place's diamond (rendering.md §8). */
export type PinShape = 'event' | 'place';

/** One pin as drawn: where it is on the globe, and how it looks. */
export interface PinItem {
  id: string;
  /** In the globe's own frame (before its tilt and turn), in radii. */
  position: [number, number, number];
  latDeg: number;
  lonDeg: number;
  shape: PinShape;
  /** The icon key, or null for a redacted pin, which shows "?". */
  icon: string | null;
  color: string;
  state: DrawnState;
  pin: ViewPin;
}

/**
 * Which of an orbit view's pins to draw, where and how (M6-T4, ux.md §6). Pure, so it's
 * unit-tested:
 * - a pin whose **location** is a hidden spoiler isn't drawn at all: drawing it would give the
 *   place away. It appears once spoilers are shown, or that location is revealed in the panel;
 * - a pin whose **entity** is a hidden spoiler is drawn grey with a "?" (the redacted state);
 * - a draft is drawn as a draft;
 * - an event takes its category's icon and color, a place the place icon;
 * - a pin "at the body" (no latitude and longitude) stands in the ring at PIN_AT_BODY_LAT_DEG;
 * - pins at the same point (a place and the events there) fan out east along its line of
 *   latitude, PIN_FAN_DEG of arc apart, so each can be seen and clicked.
 */
export function pinItems(
  pins: readonly ViewPin[],
  categories: readonly ConfigReadOf<'event_categories'>[],
  policy: SpoilerPolicy,
): PinItem[] {
  const byId = new Map(categories.map((category) => [category.id, category]));
  const shown = pins.filter(
    (pin) => !isHidden(pin.locationSpoiler, spoilerKeys.location(pin.id), policy),
  );
  const atBody = shown.filter((pin) => pin.latDeg === null || pin.lonDeg === null);
  const seen = new Map<string, number>();
  return shown.map((pin): PinItem => {
    const ring = atBody.indexOf(pin);
    const latDeg = ring < 0 ? (pin.latDeg ?? 0) : PIN_AT_BODY_LAT_DEG;
    const baseLonDeg = ring < 0 ? (pin.lonDeg ?? 0) : -180 + (360 * ring) / atBody.length;
    // The how-many-th pin at this point: 0 stays put, later ones step east. A degree of
    // longitude shrinks toward the poles (by the cosine of the latitude), so the step grows to
    // keep the same distance on the surface.
    const spot = `${latDeg.toFixed(4)},${baseLonDeg.toFixed(4)}`;
    const nth = seen.get(spot) ?? 0;
    seen.set(spot, nth + 1);
    const stepDeg = PIN_FAN_DEG / Math.max(Math.cos(latDeg * DEG), 0.2);
    const lonDeg = baseLonDeg + nth * stepDeg;
    const [x, y, z] = latLonToUnitVector({ latDeg, lonDeg });
    const redacted = isHidden(pin.isSpoiler, spoilerKeys.record(pin.id), policy);
    const category = pin.categoryId === null ? undefined : byId.get(pin.categoryId);
    const shape: PinShape = pin.kind === 'place' ? 'place' : 'event';
    return {
      id: pin.id,
      position: [x * PIN_LIFT_RADII, y * PIN_LIFT_RADII, z * PIN_LIFT_RADII],
      latDeg,
      lonDeg,
      shape,
      icon: redacted
        ? null
        : shape === 'place'
          ? PIN_PLACE_ICON
          : (category?.icon ?? PIN_EVENT_ICON),
      color: shape === 'place' ? PIN_PLACE_COLOR : (category?.color ?? PIN_EVENT_COLOR),
      state: redacted ? 'redacted' : pin.status === 'draft' ? 'draft' : 'normal',
      pin,
    };
  });
}
