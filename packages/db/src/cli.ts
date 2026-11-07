/**
 * Command-line entry for `pnpm db:migrate` and `pnpm db:reset`. It reads DATABASE_URL, which
 * the package scripts load from the repository's .env file.
 *
 *   node src/cli.ts migrate   apply pending migrations
 *   node src/cli.ts reset     drop, create and migrate (local databases only)
 */
import { databaseNameOf } from './admin.ts';
import { migrateDatabase, resetDatabase } from './migrate.ts';

const commands = {
  migrate: migrateDatabase,
  reset: resetDatabase,
} as const;

async function main(): Promise<void> {
  const commandName = process.argv[2];
  if (commandName !== 'migrate' && commandName !== 'reset') {
    throw new Error(`Usage: node src/cli.ts <${Object.keys(commands).join('|')}>`);
  }
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL is not set. Copy .env.example to .env.');
  }
  await commands[commandName](url);
  console.log(`db:${commandName}: done (${databaseNameOf(url)}).`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
