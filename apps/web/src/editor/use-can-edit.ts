import { useHealth } from '@/api/health.ts';

/**
 * Whether this reader may edit. While the API runs with `GE_AUTH_MODE=none` (local use, the
 * only mode until M8), everyone may; M8 adds the owner's session.
 */
export function useCanEdit(): boolean {
  return useHealth().data?.authMode === 'none';
}
