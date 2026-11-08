import { createApiClient } from '@ge/api-client';

/**
 * The app's one API client. Requests go to the page's own origin: Vite's dev and preview servers
 * proxy `/api` to the API, and production serves both from one host (architecture.md §14).
 */
export const api = createApiClient({ baseUrl: '' });
