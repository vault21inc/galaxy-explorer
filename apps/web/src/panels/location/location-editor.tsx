import { isPlanetType, type BaseType } from '@ge/domain';
import { useQueryClient } from '@tanstack/react-query';
import { MapPin } from 'lucide-react';
import { useId, useState } from 'react';
import { useEntityList } from '@/api/hooks.ts';
import { Button } from '@/components/ui/button.tsx';
import { Switch } from '@/components/ui/switch.tsx';
import { useEditView } from '@/levels/use-edit-view.ts';
import { useEditor } from '@/state/editor.ts';
import { INPUT_CLASS } from '../entity-form/fields/field-row.tsx';
import type { SectionProps } from '../types.ts';
import { saveLocation, type LocationWrite } from './save-location.ts';

type Mode = LocationWrite['mode'] | 'none';

const MODE_LABELS: Record<Mode, string> = {
  surface: 'On a surface',
  object: 'At an object',
  space: 'In space',
  place: 'At a place',
  none: 'Nowhere yet',
};

interface Choice {
  id: string;
  name: string;
  baseType?: BaseType;
}

/**
 * The location editor (M6-T5, data-model §3.3), for places and events in edit mode: where it is,
 * in one of four modes, and whether that's a spoiler. Every change saves at once, as one change
 * in the history.
 * - **On a surface:** a planet or moon, and a latitude and longitude; in that body's orbit
 *   view, "Pick on the globe" takes the next click there.
 * - **At an object:** any object in the view being edited, the view's own subject included.
 * - **In space:** a point in the view's frame: a system's, or the galaxy's for deep space;
 *   "Pick a point" takes the next click on the plane.
 * - **At a place:** one of the map's places, whose spot it shares.
 * An event may also be nowhere yet; a place always has a location.
 */
export function LocationEditor({ kind, entity }: SectionProps) {
  const id = useId();
  const queryClient = useQueryClient();
  const view = useEditView();
  const location = entity.location ?? null;
  const places = useEntityList('place', view ? { mapId: view.mapId } : undefined).data?.data ?? [];
  const [busy, setBusy] = useState(false);

  // What the view offers: its objects, and its subject (the system or the globe being shown).
  const subject =
    view?.payload && 'subject' in view.payload
      ? {
          id: view.subjectId,
          name: view.payload.subject.namePlain,
          baseType: view.payload.subject.baseType,
        }
      : null;
  const objects: Choice[] = [
    ...(subject ? [subject] : []),
    ...(view?.objects ?? []).map((object) => ({
      id: object.id,
      name: object.namePlain,
      baseType: object.baseType,
    })),
  ];
  const bodies = objects.filter((object) => object.baseType && isPlanetType(object.baseType));
  const placeChoices: Choice[] = places
    .filter((place) => place.id !== entity.id)
    .map((place) => ({ id: place.id, name: place.namePlain }));
  // The frame for "in space": a system view's system, or the galaxy for deep space.
  const spaceFrame =
    view?.level === 'system' ? view.subjectId : view?.level === 'galaxy' ? null : undefined;
  const isSpoiler = location?.isSpoiler ?? false;
  const mode: Mode = location?.mode ?? 'none';

  const save = async (next: LocationWrite | null) => {
    setBusy(true);
    await saveLocation(queryClient, entity, next);
    setBusy(false);
  };

  /** A sensible location in a newly chosen mode, from what the view offers, or null. */
  const defaultsFor = (next: Mode): LocationWrite | null => {
    switch (next) {
      case 'surface': {
        const body = bodies[0];
        return body
          ? { mode: 'surface', objectId: body.id, latDeg: 0, lonDeg: 0, isSpoiler }
          : null;
      }
      case 'object': {
        const object = objects[0];
        return object ? { mode: 'object', objectId: object.id, isSpoiler } : null;
      }
      case 'space':
        return spaceFrame === undefined
          ? null
          : { mode: 'space', objectId: spaceFrame, x: 0, y: 0, z: 0, isSpoiler };
      case 'place': {
        const place = placeChoices[0];
        return place ? { mode: 'place', placeId: place.id, isSpoiler } : null;
      }
      case 'none':
        return null;
    }
  };
  const modes: Mode[] = [
    'surface',
    'object',
    'space',
    'place',
    ...(kind === 'event' ? (['none'] as const) : []),
  ];
  const available = (option: Mode) =>
    option === mode || option === 'none' || defaultsFor(option) !== null;

  const pick = () => {
    useEditor
      .getState()
      .startPickingLocation({ entityId: entity.id, name: entity.namePlain, isSpoiler });
  };

  return (
    <div className="flex flex-col gap-2 text-sm" aria-busy={busy}>
      <label className="flex items-center gap-2">
        <span className="w-28 shrink-0 text-muted-foreground">Where</span>
        <select
          id={`${id}-mode`}
          aria-label="Location mode"
          className={INPUT_CLASS}
          value={mode}
          onChange={(event) => {
            const next = event.currentTarget.value as Mode;
            void save(next === 'none' ? null : defaultsFor(next));
          }}
        >
          {modes.map((option) => (
            <option key={option} value={option} disabled={!available(option)}>
              {MODE_LABELS[option]}
            </option>
          ))}
        </select>
      </label>

      {location?.mode === 'surface' && (
        <>
          <ChoiceRow
            label="Body"
            value={location.objectId ?? ''}
            choices={bodies.length > 0 ? bodies : objects}
            onChange={(objectId) => {
              void save({ ...surfaceOf(location), objectId, isSpoiler });
            }}
          />
          <div className="flex items-center gap-2">
            <span className="w-28 shrink-0 text-muted-foreground">Lat / lon (°)</span>
            <NumberInput
              label="Latitude"
              value={location.latDeg ?? 0}
              min={-90}
              max={90}
              onCommit={(latDeg) => {
                void save({ ...surfaceOf(location), latDeg, isSpoiler });
              }}
            />
            <NumberInput
              label="Longitude"
              value={location.lonDeg ?? 0}
              min={-180}
              max={179.999}
              onCommit={(lonDeg) => {
                void save({ ...surfaceOf(location), lonDeg, isSpoiler });
              }}
            />
          </div>
          {view?.level === 'orbit' && view.subjectId === location.objectId && (
            <Button variant="ghost" size="sm" className="self-start" onClick={pick}>
              <MapPin aria-hidden /> Pick on the globe
            </Button>
          )}
        </>
      )}

      {location?.mode === 'object' && (
        <ChoiceRow
          label="Object"
          value={location.objectId ?? ''}
          choices={objects}
          onChange={(objectId) => {
            void save({ mode: 'object', objectId, isSpoiler });
          }}
        />
      )}

      {location?.mode === 'space' && (
        <>
          <div className="flex items-center gap-2">
            <span className="w-28 shrink-0 text-muted-foreground">Position</span>
            {(['x', 'y', 'z'] as const).map((axis) => (
              <NumberInput
                key={axis}
                label={`Position ${axis.toUpperCase()}`}
                value={location[axis] ?? 0}
                onCommit={(value) => {
                  void save({ ...spaceOf(location), [axis]: value, isSpoiler });
                }}
              />
            ))}
          </div>
          {spaceFrame !== undefined && (spaceFrame ?? null) === (location.objectId ?? null) && (
            <Button variant="ghost" size="sm" className="self-start" onClick={pick}>
              <MapPin aria-hidden /> Pick a point
            </Button>
          )}
        </>
      )}

      {location?.mode === 'place' && (
        <ChoiceRow
          label="Place"
          value={location.placeId ?? ''}
          choices={placeChoices}
          onChange={(placeId) => {
            void save({ mode: 'place', placeId, isSpoiler });
          }}
        />
      )}

      {location && (
        <label className="flex items-center gap-2">
          <span className="w-28 shrink-0 text-muted-foreground">Location is a spoiler</span>
          <Switch
            checked={isSpoiler}
            aria-label="Location is a spoiler"
            onCheckedChange={(checked) => {
              const current = writeOf(location);
              if (current) void save({ ...current, isSpoiler: checked });
            }}
          />
        </label>
      )}
    </div>
  );
}

type Location = NonNullable<SectionProps['entity']['location']>;

function surfaceOf(location: Location) {
  return {
    mode: 'surface' as const,
    objectId: location.objectId ?? '',
    latDeg: location.latDeg ?? 0,
    lonDeg: location.lonDeg ?? 0,
  };
}

function spaceOf(location: Location) {
  return {
    mode: 'space' as const,
    objectId: location.objectId ?? null,
    x: location.x ?? 0,
    y: location.y ?? 0,
    z: location.z ?? 0,
  };
}

/** The stored location as a write, to change only its spoiler flag. */
function writeOf(location: Location): LocationWrite | null {
  switch (location.mode) {
    case 'surface':
      return surfaceOf(location);
    case 'object':
      return location.objectId ? { mode: 'object', objectId: location.objectId } : null;
    case 'space':
      return spaceOf(location);
    case 'place':
      return location.placeId ? { mode: 'place', placeId: location.placeId } : null;
  }
}

function ChoiceRow({
  label,
  value,
  choices,
  onChange,
}: {
  label: string;
  value: string;
  choices: readonly Choice[];
  onChange: (id: string) => void;
}) {
  const known = choices.some((choice) => choice.id === value);
  return (
    <label className="flex items-center gap-2">
      <span className="w-28 shrink-0 text-muted-foreground">{label}</span>
      <select
        aria-label={label}
        className={INPUT_CLASS}
        value={value}
        onChange={(event) => {
          onChange(event.currentTarget.value);
        }}
      >
        {/* Something outside this view (a body elsewhere on the map) stays chosen. */}
        {!known && value !== '' && <option value={value}>Elsewhere on the map</option>}
        {choices.map((choice) => (
          <option key={choice.id} value={choice.id}>
            {choice.name}
          </option>
        ))}
      </select>
    </label>
  );
}

function NumberInput({
  label,
  value,
  min,
  max,
  onCommit,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  onCommit: (value: number) => void;
}) {
  return (
    <input
      // Remounted for a new saved value, which replaces what's typed.
      key={value}
      type="number"
      step="any"
      aria-label={label}
      defaultValue={Number(value.toFixed(4))}
      {...(min === undefined ? {} : { min })}
      {...(max === undefined ? {} : { max })}
      className={`${INPUT_CLASS} w-0 min-w-0 flex-1`}
      onBlur={(event) => {
        const next = Number(event.currentTarget.value);
        if (!Number.isFinite(next) || next === value) return;
        if ((min !== undefined && next < min) || (max !== undefined && next > max)) return;
        onCommit(next);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur();
      }}
    />
  );
}
