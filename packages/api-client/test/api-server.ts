import { startTestApi } from '@ge/config/test-api';
import type { TestProject } from 'vitest/node';

/**
 * Global setup for the client's integration tests: the real API as a separate process, on its
 * own database (@ge/config/test-api), and where it is, for the tests.
 */

declare module 'vitest' {
  interface ProvidedContext {
    apiBaseUrl?: string;
  }
}

export default async function setup(project: TestProject): Promise<() => void> {
  const api = await startTestApi({
    testServerUrl: process.env.TEST_DATABASE_URL ?? project.config.env.TEST_DATABASE_URL,
    databaseName: 'ge_client_test',
    port: '3102',
  });
  project.provide('apiBaseUrl', api.apiUrl);
  return api.stop;
}
