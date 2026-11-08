import createClient, { type Middleware } from 'openapi-fetch';
import type { components, paths } from './generated/schema.ts';

/** An RFC 9457 problem, as every API error is (architecture.md §12). */
export type Problem = components['schemas']['Problem'];

/** A non-2xx API response, with its problem document. */
export class ApiError extends Error {
  override readonly name = 'ApiError';
  readonly status: number;
  readonly problem: Problem;

  constructor(status: number, problem: Problem) {
    super(problem.detail ?? problem.title);
    this.status = status;
    this.problem = problem;
  }
}

export interface ApiClientOptions {
  /** The API's origin, such as `http://127.0.0.1:3100`, or '' for the page's own origin. */
  baseUrl: string;
  /** Returns an `Authorization` header value, or nothing (M8). Called for every request. */
  getAuthHeader?: () => string | undefined;
  /** Called with the `X-GE-Batch-Id` of every write: what undo reverts (architecture.md §4). */
  onBatch?: (batchId: string, request: Request) => void;
  /** A fetch to use instead of the global one, for tests. */
  fetch?: typeof globalThis.fetch;
}

/**
 * The typed REST client (M1-T10): openapi-fetch over the types generated from the API's OpenAPI
 * document, so paths, parameters, bodies and responses are all checked by TypeScript.
 *
 * ```ts
 * const api = createApiClient({ baseUrl: '' });
 * const object = await unwrap(api.GET('/api/v1/objects/{id}', { params: { path: { id } } }));
 * ```
 */
export function createApiClient(options: ApiClientOptions) {
  const client = createClient<paths>({
    baseUrl: options.baseUrl,
    ...(options.fetch ? { fetch: options.fetch } : {}),
  });
  const middleware: Middleware = {
    onRequest({ request }) {
      const header = options.getAuthHeader?.();
      if (header) request.headers.set('Authorization', header);
      return request;
    },
    onResponse({ request, response }) {
      const batchId = response.headers.get('x-ge-batch-id');
      if (batchId) options.onBatch?.(batchId, request);
      return response;
    },
  };
  client.use(middleware);
  return client;
}

export type ApiClient = ReturnType<typeof createApiClient>;

/**
 * What a call returns once unwrapped: the item inside `{ data }`, or the whole page for lists,
 * which also carry `nextCursor`.
 */
export type Unwrapped<T> = T extends { data: unknown; nextCursor: unknown }
  ? T
  : T extends { data: infer Item }
    ? Item
    : T;

/**
 * Awaits a client call and returns its payload, or throws an ApiError for a problem response.
 * A 204 (deletes) returns undefined.
 */
export async function unwrap<
  Result extends { data?: unknown; error?: unknown; response: Response },
>(call: Promise<Result>): Promise<Unwrapped<NonNullable<Result['data']>>> {
  const result = await call;
  if (!result.response.ok) {
    const problem = (result.error ?? {
      type: 'about:blank',
      title: result.response.statusText,
      status: result.response.status,
    }) as Problem;
    throw new ApiError(result.response.status, problem);
  }
  const body = result.data as { data?: unknown; nextCursor?: unknown } | undefined;
  if (body && typeof body === 'object' && 'data' in body && !('nextCursor' in body)) {
    return body.data as Unwrapped<NonNullable<Result['data']>>;
  }
  return body as Unwrapped<NonNullable<Result['data']>>;
}
