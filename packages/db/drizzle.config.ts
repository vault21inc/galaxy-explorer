import { defineConfig } from 'drizzle-kit';

/**
 * drizzle-kit settings for `pnpm db:generate`, which compares src/schema with the migrations
 * already written and adds a new SQL migration for the difference. Add `--custom` for an empty
 * migration to write by hand (triggers, functions; data-model.md §12).
 *
 * Migrations are applied by our own runner (`pnpm db:migrate`, src/migrate.ts), not by
 * drizzle-kit, so no database connection is configured here.
 */
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema/index.ts',
  out: './migrations',
  casing: 'snake_case',
  strict: true,
});
