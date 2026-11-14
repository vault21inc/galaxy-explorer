import { useHealth } from '@/api/health.ts';

/**
 * Whether this reader may edit, as the API says for this request (`canEdit`): everyone while
 * it runs with `GE_AUTH_MODE=none` on your machine; only the editor in the private preview
 * (docs/ops/preview.md); with accounts, whoever is signed in (M8-T1, until M8-T11 decides it
 * per universe). Signing in or out refetches it.
 */
export function useCanEdit(): boolean {
  return useHealth().data?.canEdit === true;
}
