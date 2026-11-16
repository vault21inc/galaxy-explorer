import { createApiClient } from '@ge/api-client';
import { useHistory } from '@/state/history.ts';

/** The revert route: its batch is an undo or redo, which use-undo.ts records itself. */
const REVERT_PATH = /\/history\/[^/]+\/revert$/;
/**
 * Making the editor tour's practice universe (M8-T10): a change to a new universe, not to the
 * one open, so it isn't this universe's to undo.
 */
const PRACTICE_PATH = '/practice-universe';

/**
 * The app's one API client. Requests go to the page's own origin: Vite's dev and preview servers
 * proxy `/api` to the API, and production serves both from one host (architecture.md §14).
 * It also records each write's batch id for undo.
 */
export const api = createApiClient({
  baseUrl: '',
  // Every write's batch is an undo step for this session (M3-T6).
  onBatch: (batchId, request) => {
    const path = new URL(request.url).pathname;
    if (!REVERT_PATH.test(path) && !path.endsWith(PRACTICE_PATH)) {
      useHistory.getState().record(batchId);
    }
  },
});
