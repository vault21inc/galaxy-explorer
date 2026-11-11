import { schema, type Executor } from '@ge/db';
import type { BaseType, EntityKind } from '@ge/domain';
import { eq } from 'drizzle-orm';
import { requireInUniverse, type Scope } from '../lookup.ts';
import { checkGroup } from './groups.ts';
import { checkObject } from './objects.ts';

const { eventCategories } = schema;

/**
 * The rules for an entity's kind-specific fields, given its full state after the write
 * (current values merged with the update). Kinds without rules pass.
 */
export async function checkExtension(
  ex: Executor,
  kind: EntityKind,
  scope: Scope,
  id: string | undefined,
  state: Record<string, unknown>,
): Promise<void> {
  switch (kind) {
    case 'celestial_object':
      return checkObject(ex, scope, {
        ...(id === undefined ? {} : { id }),
        baseType: state.baseType as BaseType,
        parentId: (state.parentId as string | null | undefined) ?? null,
        orbitCenterId: (state.orbitCenterId as string | null | undefined) ?? null,
        subtypeId: (state.subtypeId as string | null | undefined) ?? null,
        explorable: (state.explorable as boolean | undefined) ?? false,
      });
    case 'group':
      return checkGroup(ex, scope, {
        ...(id === undefined ? {} : { id }),
        groupTypeId: state.groupTypeId as string,
        parentGroupId: (state.parentGroupId as string | null | undefined) ?? null,
      });
    case 'event': {
      const categoryId = state.categoryId as string | null | undefined;
      if (categoryId) {
        requireInUniverse(
          await ex.select().from(eventCategories).where(eq(eventCategories.id, categoryId)),
          scope,
          '/categoryId',
          'event category',
        );
      }
      return;
    }
    case 'place':
    case 'character':
      return;
  }
}
