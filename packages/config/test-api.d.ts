/** Types for test-api.js: the real API in a separate process, for integration tests. */
export function startTestApi(options: {
  testServerUrl: string | undefined;
  databaseName: string;
  port: string;
}): Promise<{ apiUrl: string; databaseUrl: string; stop: () => void }>;
