# Migrations

Applied in order by `pnpm db:migrate` (`src/migrate.ts`); Drizzle records the applied ones in `drizzle.__drizzle_migrations`.

## Rules

- **Never edit a migration once it has been applied anywhere,** not even locally by someone else. Add a new one.
- **One migration per task** (data-model §12).
- **Start from Drizzle:** change `src/schema/`, then run `pnpm db:generate --name <what-changed>`. It writes the SQL for tables, columns, keys, checks and indexes.
- **Append what Drizzle can't express** to the end of the same file, below a comment that says it's hand-written:
  - **every foreign key,** because each must be `DEFERRABLE INITIALLY IMMEDIATE` (data-model §2) and Drizzle can't say so. That's why `src/schema/` declares no foreign keys at all;
  - `NULLS NOT DISTINCT … WHERE` indexes;
  - triggers and functions. For a migration that is only these, use `pnpm db:generate --custom --name <name>`.
- **Name constraints** `<table>_<what>_<fk|uq|check|idx>`, so a constraint error says what was violated.
- `pnpm test:integration` in `packages/db` migrates a fresh database and runs the constraint and consistency tests, which check that every foreign key is deferrable.
