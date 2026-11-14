import { schema, type Executor } from '@ge/db';
import { entityKinds, referencesOf, refFieldOf, type EntityKind } from '@ge/domain';
import { and, eq, ne } from 'drizzle-orm';
import {
  addCitation,
  addLink,
  addRelation,
  attachImage,
  setFact,
  updateRelation,
} from '../services/aspects/content.ts';
import { addMembers, setLocation, setMembers } from '../services/aspects/placement.ts';
import { setWaypoints } from '../services/aspects/waypoints.ts';
import { applyEntityUpdate, insertEntity, type EntityScope } from '../services/entity-service.ts';
import { RuleViolation } from '../services/errors.ts';
import { topoOrder } from './records.ts';
import { withIds, type EntityRefs, type ImportRun, type Resolvers } from './import-context.ts';
import type { EntityEntry, MapContent } from './import-read.ts';

/**
 * Importing entities (M7-T4), through the entity and aspect services so every rule applies:
 * 1. each entity, parents first: created, or in a merge, upserted by its external key;
 * 2. its aspects, once every entity of the file exists (a location or member may be a later
 *    one). An entity a merge updated has each aspect the file lists replaced by the file's;
 *    an aspect the file leaves out stays as it is;
 * 3. the file's relations.
 */

type Row = Record<string, unknown>;

/** Record fields that are aspects rather than the entity's own. */
const ASPECTS = [
  'facts',
  'images',
  'links',
  'citations',
  'location',
  'members',
  'waypoints',
] as const;

const { citations, entityImages, entityLinks, entityLocations, entityRelations, fieldValues } =
  schema;

/** An entry already there with a key the import may use: what a merge needs to update it. */
export interface ExistingEntry {
  id: string;
  kind: string;
  version: number;
}

export interface Imported {
  entry: EntityEntry;
  id: string;
  created: boolean;
}

const refOf = (record: Row) => (record.ref ?? record.externalKey ?? null) as string | null;

/** The record fields naming another entity: `parent`, `orbitCenter`, `parentGroup`. */
const entityRefFields = (kind: EntityKind) =>
  Object.entries(referencesOf(kind))
    .filter(([, target]) => target === 'entity')
    .map(([field]) => refFieldOf(field));

export async function importEntities(
  tx: Executor,
  run: ImportRun,
  scope: EntityScope,
  entries: readonly EntityEntry[],
  refs: EntityRefs,
  resolvers: Resolvers,
  existingKeys: ReadonlyMap<string, ExistingEntry>,
): Promise<Imported[]> {
  const ordered = topoOrder(
    entries,
    (entry) => refOf(entry.record) ?? entry.where,
    (entry) => entityRefFields(entry.kind).map((field) => entry.record[field]),
  );
  const imported: Imported[] = [];
  for (const entry of ordered) {
    const { kind, record, where } = entry;
    const section = entityKinds[kind].plural;
    const ref = refOf(record);
    const key = (record.externalKey ?? null) as string | null;
    if (ref !== null && refs.inFile(ref)) {
      run.conflict(where, `Another entry in this file is also called “${ref}”.`);
      continue;
    }
    const leaveOut = (why: string) => {
      if (ref !== null) refs.skip(ref, why);
    };
    if (run.mode === 'merge' && key === null) {
      run.skip(where, 'It has no external key, so an update by key can’t match it.');
      run.count(section, 'skip');
      leaveOut('it has no external key');
      continue;
    }
    if (run.mode === 'create' && key !== null && existingKeys.has(key)) {
      run.conflict(
        where,
        `The key “${key}” is already used here. Import with “Update by key” to update that entry.`,
      );
      leaveOut('its key is taken');
      continue;
    }
    const converted = withIds(record, referencesOf(kind), resolvers, { drop: ['ref', ...ASPECTS] });
    if ('missing' in converted) {
      run.missing(where, converted);
      leaveOut('it refers to something not imported');
      continue;
    }
    // In a merge, the entry with this key is updated. The keys were read once, with each
    // entry's kind and version, so the write needs no lookups of its own; nor is the entry
    // read back, which the services' create and update would do (M7-T4's 30 s budget).
    const existing = key !== null && run.mode === 'merge' ? existingKeys.get(key) : undefined;
    const saved = await run.step(tx, where, async (sp) => {
      if (!existing) {
        return { id: await insertEntity(sp, kind, scope, converted.input as never), created: true };
      }
      if (existing.kind !== kind) {
        throw new RuleViolation(`The key “${String(key)}” already belongs to a ${existing.kind}.`);
      }
      const input = { ...converted.input, version: existing.version };
      await applyEntityUpdate(sp, kind, existing.id, input as never);
      return { id: existing.id, created: false };
    });
    if (!saved) {
      leaveOut('it couldn’t be imported');
      continue;
    }
    if (ref !== null) refs.set(ref, saved.id);
    run.count(section, saved.created ? 'create' : 'update');
    imported.push({ entry, id: saved.id, created: saved.created });
  }
  return imported;
}

export async function importAspects(
  tx: Executor,
  run: ImportRun,
  imported: readonly Imported[],
  resolvers: Resolvers,
): Promise<void> {
  for (const { entry, id, created } of imported) {
    const { record, where } = entry;
    if (!ASPECTS.some((aspect) => aspect in record)) continue;
    const replace = !created;
    const list = (aspect: (typeof ASPECTS)[number]) => (record[aspect] ?? []) as Row[];
    /** An aspect's references as ids; one that leads nowhere is reported and left out. */
    const ids = (
      row: Row,
      references: Record<string, 'entity' | 'asset' | 'field_definitions'>,
      names = {},
    ) => {
      const converted = withIds(row, references, resolvers, { names });
      if ('missing' in converted) {
        run.missing(where, converted);
        return null;
      }
      return converted.input;
    };
    await run.step(tx, where, async (sp) => {
      if ('facts' in record) {
        if (replace) await sp.delete(fieldValues).where(eq(fieldValues.entityId, id));
        for (const fact of list('facts')) {
          const input = ids(
            fact,
            { fieldDefinitionId: 'field_definitions' },
            { fieldDefinitionId: 'field' },
          );
          if (input) await setFact(sp, id, input as never);
        }
      }
      if ('images' in record) {
        if (replace) await sp.delete(entityImages).where(eq(entityImages.entityId, id));
        for (const image of list('images')) {
          const input = ids(image, { assetId: 'asset' });
          if (input) await attachImage(sp, id, input as never);
        }
      }
      if ('links' in record) {
        if (replace) await sp.delete(entityLinks).where(eq(entityLinks.entityId, id));
        for (const link of list('links')) await addLink(sp, id, link as never);
      }
      if ('citations' in record) {
        if (replace) await sp.delete(citations).where(eq(citations.entityId, id));
        for (const citation of list('citations')) await addCitation(sp, id, citation as never);
      }
      if ('location' in record) {
        const location = record.location as Row | null;
        if (location === null) {
          await sp.delete(entityLocations).where(eq(entityLocations.entityId, id));
        } else {
          const input = ids(location, { objectId: 'entity', placeId: 'entity' });
          if (input) await setLocation(sp, id, input as never);
        }
      }
      if ('members' in record) {
        const members = list('members').flatMap(
          (member) => ids(member, { objectId: 'entity' }) ?? [],
        );
        await (replace ? setMembers : addMembers)(sp, id, members as never);
      }
      if ('waypoints' in record) {
        const objectIds = (record.waypoints as string[]).flatMap((ref) => {
          const found = resolvers.entities.resolve(ref);
          if ('missing' in found) {
            run.missing(where, found);
            return [];
          }
          return [found.id];
        });
        await setWaypoints(sp, id, { objectIds });
      }
    });
  }
}

export async function importRelations(
  tx: Executor,
  run: ImportRun,
  source: string,
  relations: readonly Row[],
  resolvers: Resolvers,
): Promise<void> {
  for (const [index, relation] of relations.entries()) {
    const where = `${source} › relations › #${String(index + 1)}`;
    const from = resolvers.entities.resolve(relation.from as string);
    const to = resolvers.entities.resolve(relation.to as string);
    if ('missing' in from || 'missing' in to) {
      for (const end of [from, to]) if ('missing' in end) run.missing(where, end);
      continue;
    }
    const { from: _from, to: _to, ...fields } = relation;
    const [existing] = await tx
      .select({ id: entityRelations.id })
      .from(entityRelations)
      .where(
        and(
          eq(entityRelations.fromEntityId, from.id),
          eq(entityRelations.toEntityId, to.id),
          eq(entityRelations.relationType, fields.relationType as string),
        ),
      );
    if (existing && run.mode === 'create') {
      run.count('relations', 'keep');
      continue;
    }
    const saved = await run.step(tx, where, (sp) => {
      const { relationType: _type, ...patch } = fields;
      return existing
        ? updateRelation(sp, existing.id, patch)
        : addRelation(sp, from.id, { ...fields, toEntityId: to.id } as never);
    });
    if (saved) run.count('relations', existing ? 'update' : 'create');
  }
}

/**
 * A CSV's `group_key`s: each object joins that group, leaving any other group of the same type
 * (an object is in one group of each type).
 */
export async function importMemberships(
  tx: Executor,
  run: ImportRun,
  content: MapContent,
  refs: EntityRefs,
): Promise<void> {
  for (const membership of content.memberships) {
    const object = refs.resolve(membership.object);
    const group = refs.resolve(membership.group);
    if ('missing' in object || 'missing' in group) {
      for (const end of [object, group]) if ('missing' in end) run.missing(membership.where, end);
      continue;
    }
    const saved = await run.step(tx, membership.where, async (sp) => {
      const [type] = await sp
        .select({ groupTypeId: schema.objectGroups.groupTypeId })
        .from(schema.objectGroups)
        .where(eq(schema.objectGroups.entityId, group.id));
      if (type) {
        await sp
          .delete(schema.groupMembers)
          .where(
            and(
              eq(schema.groupMembers.objectId, object.id),
              eq(schema.groupMembers.groupTypeId, type.groupTypeId),
              ne(schema.groupMembers.groupId, group.id),
            ),
          );
      }
      return addMembers(sp, group.id, [{ objectId: object.id }]);
    });
    if (saved) run.count('members', 'create');
  }
}
