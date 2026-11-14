import { sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { ACCOUNT_TABLES, AUDITED_TABLES, CLONE_SPEC, tableKey } from '../src/audit/index.ts';
import { withTestDb } from '../src/testing/index.ts';

// The audit trigger and the clone spec must cover every content table (architecture.md §3.6,
// data-model §9–10). These fail when a new table is added without them.

const audited = AUDITED_TABLES.map(tableKey);
const auditedNames = audited.map((table) => table.name);
const cloned = CLONE_SPEC.map((entry) => entry.table);
/** Tables that are bookkeeping or accounts (M8-T1), not content: never audited. */
const NOT_AUDITED = [
  'change_batches',
  'change_log',
  ...ACCOUNT_TABLES.map((t) => tableKey(t).name),
];

describe('audit and clone coverage', () => {
  it('gives every audited table the trigger, with its primary key as arguments', () =>
    withTestDb(async (db) => {
      const result = await db.execute<{ table: string; args: string }>(sql`
        select c.relname as table, encode(t.tgargs, 'escape') as args
        from pg_trigger t join pg_class c on c.oid = t.tgrelid
        where t.tgname = 'ge_audit' and not t.tgisinternal`);
      // tgargs holds the arguments separated by NUL bytes.
      const triggers = Object.fromEntries(
        result.rows.map((row) => [row.table, row.args.split('\\000').filter(Boolean)]),
      );
      expect(triggers).toEqual(Object.fromEntries(audited.map((t) => [t.name, t.primaryKey])));
    }));

  it('audits every table except the history and account tables', () =>
    withTestDb(async (db) => {
      const result = await db.execute<{ table: string }>(
        sql`select tablename as table from pg_tables where schemaname = 'public'`,
      );
      const content = result.rows.map((row) => row.table).filter((t) => !NOT_AUDITED.includes(t));
      expect(content.sort()).toEqual([...auditedNames].sort());
    }));

  it('audits and clones every table with a map_id or a foreign key to entities', () =>
    withTestDb(async (db) => {
      const result = await db.execute<{ table: string }>(sql`
        select distinct table_name as table from information_schema.columns
        where table_schema = 'public' and column_name = 'map_id'
        union
        select distinct conrelid::regclass::text from pg_constraint
        where contype = 'f' and confrelid = 'public.entities'::regclass`);
      const mapScoped = result.rows.map((row) => row.table);
      expect(mapScoped.length).toBeGreaterThan(5);
      for (const table of mapScoped) {
        expect(auditedNames, `${table} is audited`).toContain(table);
        expect(cloned, `${table} is in CLONE_SPEC`).toContain(table);
      }
    }));

  it('names only real columns in CLONE_SPEC', () =>
    withTestDb(async (db) => {
      const result = await db.execute<{ table: string; column: string }>(sql`
        select table_name as table, column_name as column from information_schema.columns
        where table_schema = 'public'`);
      const columns = new Set(result.rows.map((row) => `${row.table}.${row.column}`));
      for (const entry of CLONE_SPEC) {
        for (const column of [...entry.freshIds, ...entry.remap]) {
          expect(columns, `${entry.table}.${column}`).toContain(`${entry.table}.${column}`);
        }
      }
    }));
});
