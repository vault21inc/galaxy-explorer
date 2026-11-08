import { unwrap } from '@ge/api-client';
import { api } from './client.ts';
import type { Query, RequestSpec } from './requests.ts';

type LooseGet = (
  path: string,
  init: { params: { path: Record<string, string>; query: Query }; signal?: AbortSignal },
) => Promise<{ data?: unknown; error?: unknown; response: Response }>;

/**
 * openapi-fetch types each path as a literal, but registry-derived paths are built at run time
 * (requests.ts). This is the one door they go through untyped. The domain's Zod types describe
 * what comes back, and requests.test.ts checks every path against the OpenAPI document. It still
 * goes through the shared client, so its middleware (auth in M8) applies.
 */
const looseGet: LooseGet = (path, init) => api.GET(path as never, init as never);

/** Fetches a request built in requests.ts and unwraps `{ data }`, throwing ApiError on failure. */
export async function fetchData<T>(spec: RequestSpec, signal?: AbortSignal): Promise<T> {
  const init = { params: { path: spec.path, query: spec.query }, ...(signal ? { signal } : {}) };
  return (await unwrap(looseGet(spec.template, init))) as T;
}
