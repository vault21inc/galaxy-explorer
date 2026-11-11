import { spoilerKeys } from '@ge/domain';
import { useEntity } from '@/api/hooks.ts';
import { Redactable } from '@/richtext/redactable.tsx';
import type { SectionProps } from '../types.ts';
import { SectionHeading } from './section-heading.tsx';

/**
 * Where a place or event is (E3, E4, M6-T4): on a body's surface at a latitude and longitude,
 * at a body, at a place, or in space. A location flagged as a spoiler is blacked out
 * ("Location: ▇▇▇▇", ux.md §6), and revealing it here also shows its pin on the globe.
 */
export function LocationSection({ entity }: SectionProps) {
  const location = entity.location;
  if (!location) return null;
  return (
    <section>
      <SectionHeading>Location</SectionHeading>
      <p className="text-sm">
        <Redactable
          flagged={location.isSpoiler}
          revealKey={spoilerKeys.location(entity.id)}
          hiddenText="Somewhere on the map"
        >
          <LocationText location={location} />
        </Redactable>
      </p>
    </section>
  );
}

type Location = NonNullable<SectionProps['entity']['location']>;

function LocationText({ location }: { location: Location }) {
  const body = useEntity('celestial_object', location.objectId ?? undefined).data;
  const place = useEntity('place', location.placeId ?? undefined).data;
  const bodyName = body?.namePlain ?? 'its world';
  switch (location.mode) {
    case 'surface':
      return (
        <>
          {formatLatLon(location.latDeg ?? 0, location.lonDeg ?? 0)} on {bodyName}
        </>
      );
    case 'object':
      return <>At {bodyName}</>;
    case 'place':
      return <>At {place?.namePlain ?? 'a place'}</>;
    case 'space':
      return <>In space, in {bodyName}</>;
  }
}

/** "12.5° N, 40.2° W": degrees with a hemisphere letter, as maps write them. */
export function formatLatLon(latDeg: number, lonDeg: number): string {
  const degrees = (value: number) => `${Math.abs(value).toFixed(1).replace(/\.0$/, '')}°`;
  return `${degrees(latDeg)} ${latDeg < 0 ? 'S' : 'N'}, ${degrees(lonDeg)} ${lonDeg < 0 ? 'W' : 'E'}`;
}
