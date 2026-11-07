import type { TestProject } from 'vitest/node';
import './context.ts';
import { ensureTemplateDatabase } from './template.ts';

/**
 * Vitest global setup for integration tests that use `withTestDb`. It runs once per test run,
 * before any test file: it makes sure the migrated template database exists, then tells the
 * test files its name. Packages opt in through `vitestConfig({ integrationGlobalSetup })` (@ge/config/vitest).
 */
export default async function setup(project: TestProject): Promise<void> {
  // The integration project loads .env into `test.env`; a variable set in the shell wins.
  const serverUrl = process.env.TEST_DATABASE_URL ?? project.config.env.TEST_DATABASE_URL;
  if (!serverUrl) {
    throw new Error(
      'TEST_DATABASE_URL is not set. Copy .env.example to .env and run `pnpm db:up`.',
    );
  }
  const templateName = await ensureTemplateDatabase(serverUrl);
  project.provide('geTestDatabase', { serverUrl, templateName });
}
