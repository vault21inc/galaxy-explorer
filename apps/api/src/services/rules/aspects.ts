import { schema, type Executor } from '@ge/db';
import {
  entityKinds,
  objectTypes,
  relationTypes,
  viewLevels,
  type EntityKind,
  type FieldValue,
  type LocationWrite,
  type RelationType,
} from '@ge/domain';
import { eq } from 'drizzle-orm';
import type { z } from 'zod';
import { RuleViolation } from '../errors.ts';
import {
  requireInUniverse,
  requireReferencedEntity,
  requireReferencedObject,
  type Scope,
} from '../lookup.ts';

const { assets, celestialObjects, fieldDefinitions } = schema;

/** The entity an aspect belongs to, as the aspect rules need it. */
export interface AspectOwner {
  id: string;
  kind: EntityKind;
  universeId: string;
  mapId: string | null;
}

const scopeOf = (owner: AspectOwner): Scope => ({
  universeId: owner.universeId,
  mapId: owner.mapId,
});

/** The kind supports this aspect (architecture.md §3.1 `aspects`). */
export function checkAspectAllowed(
  owner: AspectOwner,
  aspect: 'images' | 'links' | 'facts' | 'relations' | 'location',
): void {
  const aspects = entityKinds[owner.kind].aspects;
  const allowed = aspect === 'location' ? aspects.location !== 'none' : aspects[aspect];
  if (!allowed) {
    throw new RuleViolation(
      `A ${entityKinds[owner.kind].label.one.toLowerCase()} can't have ${aspect === 'location' ? 'a location' : aspect}.`,
    );
  }
}

/** An image's asset belongs to the same universe. */
export async function checkImage(ex: Executor, owner: AspectOwner, assetId: string): Promise<void> {
  checkAspectAllowed(owner, 'images');
  requireInUniverse(
    await ex.select().from(assets).where(eq(assets.id, assetId)),
    scopeOf(owner),
    '/assetId',
    'asset',
  );
}

/**
 * A relation's ends are kinds its type allows (architecture.md §3.4), in the same universe,
 * and not the same entity. Relations may cross maps: a character relates to events anywhere.
 */
export async function checkRelation(
  ex: Executor,
  from: AspectOwner,
  relationType: RelationType,
  toEntityId: string,
): Promise<void> {
  checkAspectAllowed(from, 'relations');
  if (toEntityId === from.id)
    throw new RuleViolation("An entity can't be related to itself.", '/toEntityId');
  const to = await requireReferencedEntity(ex, toEntityId, scopeOf(from), '/toEntityId', {
    sameMap: false,
  });
  const type = relationTypes[relationType];
  const fits = (end: '*' | readonly EntityKind[], kind: string) =>
    end === '*' || (end as readonly string[]).includes(kind);
  if (!fits(type.from, from.kind) || !fits(type.to, to.kind)) {
    throw new RuleViolation(
      `"${type.label}" relates ${describeEnd(type.from)} to ${describeEnd(type.to)}, not a ${from.kind} to a ${to.kind}.`,
      '/relationType',
    );
  }
}

function describeEnd(end: '*' | readonly EntityKind[]): string {
  return end === '*'
    ? 'anything'
    : end.map((kind) => entityKinds[kind].label.many.toLowerCase()).join(' or ');
}

/**
 * A location fits its mode (data-model §3.4, E3, E4):
 * - only kinds with a location aspect (places, events) have one;
 * - `surface`: on a body that has an orbit view (planets and moons), so it has a globe;
 * - `object`: at any object on the same map;
 * - `space`: in the frame of a body that has a system view (a system), or the galaxy;
 * - `place`: at a place on the same map, not at itself.
 */
export async function checkLocation(
  ex: Executor,
  owner: AspectOwner,
  location: z.infer<typeof LocationWrite>,
): Promise<void> {
  checkAspectAllowed(owner, 'location');
  const scope = scopeOf(owner);
  const surfaceTypes: readonly string[] = viewLevels.orbit.subject;
  const frameTypes: readonly string[] = viewLevels.system.subject;

  if (location.mode === 'surface') {
    const body = await requireReferencedObject(ex, location.objectId, scope, '/objectId');
    if (!surfaceTypes.includes(body.baseType)) {
      throw new RuleViolation(
        `A ${body.baseType.replace('_', ' ')} has no surface; use mode "object" instead.`,
        '/objectId',
      );
    }
  } else if (location.mode === 'object') {
    await requireReferencedObject(ex, location.objectId, scope, '/objectId');
  } else if (location.mode === 'space') {
    if (location.objectId) {
      const frame = await requireReferencedObject(ex, location.objectId, scope, '/objectId');
      if (!frameTypes.includes(frame.baseType)) {
        throw new RuleViolation(
          `Positions in space are in a system's frame or the galaxy's, not a ${frame.baseType}'s.`,
          '/objectId',
        );
      }
    }
  } else {
    if (location.placeId === owner.id)
      throw new RuleViolation("A place can't be located at itself.", '/placeId');
    const place = await requireReferencedEntity(ex, location.placeId, scope, '/placeId');
    if (place.kind !== 'place')
      throw new RuleViolation(`/placeId names a ${place.kind}, not a place.`, '/placeId');
  }
}

/**
 * A fact's field definition applies to this entity (U2): its universe, its kind and, when the
 * definition narrows it, the object's base type or subtype. The value has the definition's type.
 */
export async function checkFact(
  ex: Executor,
  owner: AspectOwner,
  fieldDefinitionId: string,
  value: FieldValue,
): Promise<void> {
  checkAspectAllowed(owner, 'facts');
  const definition = requireInUniverse(
    await ex.select().from(fieldDefinitions).where(eq(fieldDefinitions.id, fieldDefinitionId)),
    scopeOf(owner),
    '/fieldDefinitionId',
    'field definition',
  );
  if (definition.appliesToKind !== owner.kind) {
    throw new RuleViolation(
      `"${definition.label}" is a field for ${definition.appliesToKind} entries, not ${owner.kind}.`,
      '/fieldDefinitionId',
    );
  }
  if (definition.appliesToBaseType !== null || definition.appliesToSubtypeId !== null) {
    const [object] = await ex
      .select()
      .from(celestialObjects)
      .where(eq(celestialObjects.entityId, owner.id));
    const baseTypeFits =
      definition.appliesToBaseType === null || object?.baseType === definition.appliesToBaseType;
    const subtypeFits =
      definition.appliesToSubtypeId === null || object?.subtypeId === definition.appliesToSubtypeId;
    if (!baseTypeFits || !subtypeFits) {
      const target = definition.appliesToBaseType
        ? objectTypes[definition.appliesToBaseType as keyof typeof objectTypes].label.toLowerCase()
        : 'subtype';
      throw new RuleViolation(
        `"${definition.label}" only applies to a particular ${target}.`,
        '/fieldDefinitionId',
      );
    }
  }
  if (value.type !== definition.valueType) {
    throw new RuleViolation(
      `"${definition.label}" holds ${definition.valueType} values, not ${value.type}.`,
      '/value/type',
    );
  }
}
