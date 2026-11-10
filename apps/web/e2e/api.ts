import type { APIRequestContext } from '@playwright/test';

/**
 * How long one API read in a test may take. Reads through `vite preview`'s proxy very rarely
 * stall under parallel load; without a limit, a stalled read inside `expect.poll` uses up the
 * whole poll, while with one the read fails and the poll simply tries again.
 */
const READ_TIMEOUT_MS = 3_000;
/**
 * A read outside a poll has no one to try it again, so `getJson` does: a stall is the proxy's,
 * not the app's, and a fresh request goes through.
 */
const READ_ATTEMPTS = 3;

/** Reads an API path as JSON, for checking what the app saved. */
export async function getJson(request: APIRequestContext, url: string): Promise<unknown> {
  for (let attempt = 1; ; attempt++) {
    try {
      const response = await request.get(url, { timeout: READ_TIMEOUT_MS });
      return await response.json();
    } catch (error) {
      const stalled = error instanceof Error && error.name === 'TimeoutError';
      if (!stalled || attempt >= READ_ATTEMPTS) throw error;
    }
  }
}
