import { schema, type Executor } from '@ge/db';
import { objectTypes, type BaseType } from '@ge/domain';
import { eq } from 'drizzle-orm';
import { RuleViolation } from '../errors.ts';
import { requireInUniverse, requireReferencedObject, type Scope } from '../lookup.ts';

const { celestialObjects, objectSubtypes } = schema;

export interface ObjectState {
  /** Set when updating; absent when creating. */
  id?: string;
  baseType: BaseType;
  parentId: string | null;
  subtypeId: string | null;
  explorable: boolean;
}

/**
 * Rules for celestial objects (data-model §3.3), all read from the object-type registry:
 * - the parent's base type is one the type allows, with 'map' meaning the top level;
 * - the parent is on the same map, and an object can't end up inside itself;
 * - children stay allowed when an object's base type changes;
 * - `explorable` only for types that open a view;
 * - the subtype belongs to this universe and refines this base type.
 */
export async function checkObject(ex: Executor, scope: Scope, object: ObjectState): Promise<void> {
  const type = objectTypes[object.baseType];
  const allowedParents: readonly string[] = type.parents;

  if (object.parentId === null) {
    if (!allowedParents.includes('map')) {
      throw new RuleViolation(
        `A ${type.label.toLowerCase()} can't be at the top level; put it inside a ${allowedParents.join(' or ')}.`,
        '/parentId',
      );
    }
  } else {
    const parent = await requireReferencedObject(ex, object.parentId, scope, '/parentId');
    if (!allowedParents.includes(parent.baseType)) {
      throw new RuleViolation(
        `A ${type.label.toLowerCase()} can't be inside a ${parent.baseType.replace('_', ' ')}; allowed: ${allowedParents.join(', ')}.`,
        '/parentId',
      );
    }
    if (object.id !== undefined && (await ancestorIds(ex, object.parentId)).includes(object.id)) {
      throw new RuleViolation(
        "An object can't be placed inside itself or its own children.",
        '/parentId',
      );
    }
  }

  if (object.id !== undefined) {
    const children = await ex
      .select({ baseType: celestialObjects.baseType })
      .from(celestialObjects)
      .where(eq(celestialObjects.parentId, object.id));
    const blocked = children.find(
      (child) =>
        !(objectTypes[child.baseType as BaseType].parents as readonly string[]).includes(
          object.baseType,
        ),
    );
    if (blocked) {
      throw new RuleViolation(
        `This object contains a ${blocked.baseType.replace('_', ' ')}, which can't be inside a ${object.baseType.replace('_', ' ')}.`,
        '/baseType',
      );
    }
  }

  if (object.explorable && type.explorableAs === null) {
    throw new RuleViolation(
      `A ${type.label.toLowerCase()} doesn't open a view, so it can't be explorable.`,
      '/explorable',
    );
  }

  if (object.subtypeId !== null) {
    const subtype = requireInUniverse(
      await ex.select().from(objectSubtypes).where(eq(objectSubtypes.id, object.subtypeId)),
      scope,
      '/subtypeId',
      'subtype',
    );
    if (subtype.baseType !== object.baseType) {
      throw new RuleViolation(
        `${subtype.name} is a subtype of ${subtype.baseType}, not ${object.baseType}.`,
        '/subtypeId',
      );
    }
  }
}

/** The ids of an object and all its ancestors, nearest first. */
async function ancestorIds(ex: Executor, objectId: string): Promise<string[]> {
  const ids: string[] = [];
  let current: string | null = objectId;
  while (current !== null && !ids.includes(current)) {
    ids.push(current);
    const [row] = await ex
      .select({ parentId: celestialObjects.parentId })
      .from(celestialObjects)
      .where(eq(celestialObjects.entityId, current));
    current = row?.parentId ?? null;
  }
  return ids;
}
