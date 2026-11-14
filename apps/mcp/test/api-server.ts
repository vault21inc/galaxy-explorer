import { startTestApi } from '@ge/config/test-api';
import type { TestProject } from 'vitest/node';

/**
 * Global setup for the MCP server's integration tests: the real API as a separate process, on
 * its own database (@ge/config/test-api). The tests read the database itself to check what
 * the tools did, through `pg`, since this package may not import @ge/db.
 */

declare module 'vitest' {
  interface ProvidedContext {
    apiUrl?: string;
    databaseUrl?: string;
  }
}

export default async function setup(project: TestProject): Promise<() => void> {
  const api = await startTestApi({
    testServerUrl: process.env.TEST_DATABASE_URL ?? project.config.env.TEST_DATABASE_URL,
    databaseName: 'ge_mcp_test',
    port: '3105',
  });
  project.provide('apiUrl', api.apiUrl);
  project.provide('databaseUrl', api.databaseUrl);
  return api.stop;
}
