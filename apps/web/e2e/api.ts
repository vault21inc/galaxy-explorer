import type { APIRequestContext } from '@playwright/test';

/**
 * How long one API read in a test may take. Reads through `vite preview`'s proxy very rarely
 * stall under parallel load; without a limit, a stalled read inside `expect.poll` uses up the
 * whole poll, while with one the read fails and the poll simply tries again.
 */
const READ_TIMEOUT_MS = 3_000;

/** Reads an API path as JSON, for checking what the app saved. */
export async function getJson(request: APIRequestContext, url: string): Promise<unknown> {
  const response = await request.get(url, { timeout: READ_TIMEOUT_MS });
  return response.json();
}
