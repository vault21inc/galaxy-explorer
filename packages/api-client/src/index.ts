/**
 * @ge/api-client: the typed REST client used by the web app and the MCP server, generated from
 * the API's OpenAPI document (`pnpm api:generate`). It imports no other workspace package.
 */
export {
  ApiError,
  createApiClient,
  unwrap,
  type ApiClient,
  type ApiClientOptions,
  type Problem,
  type Unwrapped,
} from './client.ts';
export type { components, operations, paths } from './generated/schema.ts';
