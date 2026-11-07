import { rt } from '@ge/domain';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { withBatch, type Actor } from '../src/audit/index.ts';
import { changeBatches, changeLog, universes } from '../src/schema/index.ts';
import { withTestDb } from '../src/testing/index.ts';
import { expectPgError } from './fixtures.ts';

const actor: Actor = { type: 'local', label: 'local' };
const universe = (slug: string) => ({ slug, name: rt.plain(slug), namePlain: slug });

describe('withBatch', () => {
  it('rejects a write outside a batch with GE400', () =>
    withTestDb(async (db) => {
      await expectPgError(db.insert(universes).values(universe('loose')), 'GE400');
    }));

  it('records the batch and logs every changed row in it', () =>
    withTestDb(async (db) => {
      const { result, batchId } = await withBatch(db, actor, 'Create two universes', async (tx) => {
        await tx.insert(universes).values([universe('one'), universe('two')]);
        await tx.update(universes).set({ namePlain: 'One' }).where(eq(universes.slug, 'one'));
        return 'done';
      });

      expect(result).toBe('done');
      const [batch] = await db.select().from(changeBatches).where(eq(changeBatches.id, batchId));
      expect(batch).toMatchObject({
        actorType: 'local',
        actorLabel: 'local',
        description: 'Create two universes',
      });
      const log = await db
        .select()
        .from(changeLog)
        .where(eq(changeLog.batchId, batchId))
        .orderBy(changeLog.id);
      expect(log.map((entry) => [entry.tableName, entry.op])).toEqual([
        ['universes', 'INSERT'],
        ['universes', 'INSERT'],
        ['universes', 'UPDATE'],
      ]);
      expect(log[2]?.before).toMatchObject({ name_plain: 'one' });
      expect(log[2]?.after).toMatchObject({ name_plain: 'One' });
      expect(Object.keys(log[0]?.pk as object)).toEqual(['id']);
    }));

  it("doesn't leak the batch to later writes on the same connection", () =>
    withTestDb(async (db) => {
      await withBatch(db, actor, 'First', (tx) => tx.insert(universes).values(universe('first')));
      await expectPgError(db.insert(universes).values(universe('second')), 'GE400');
    }));

  it('leaves nothing behind when the callback fails', () =>
    withTestDb(async (db) => {
      await expect(
        withBatch(db, actor, 'Fails', async (tx) => {
          await tx.insert(universes).values(universe('doomed'));
          throw new Error('boom');
        }),
      ).rejects.toThrow('boom');
      expect(await db.select().from(changeBatches)).toEqual([]);
      expect(await db.select().from(universes)).toEqual([]);
    }));
});
