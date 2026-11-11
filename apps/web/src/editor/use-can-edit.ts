import { useHealth } from '@/api/health.ts';

/**
 * Whether this reader may edit, as the API says for this request (`canEdit`): everyone while
 * it runs with `GE_AUTH_MODE=none` on your machine; only the editor in the private preview
 * (docs/ops/preview.md); M8 adds the owner's session.
 */
export function useCanEdit(): boolean {
  return useHealth().data?.canEdit === true;
}
