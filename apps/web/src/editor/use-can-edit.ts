import { useParams } from 'react-router';
import { useUniverseBySlug } from '@/api/containers.ts';
import { useHealth } from '@/api/health.ts';

/**
 * Whether this reader may edit the universe on screen (M8-T11): its `access`, as the API
 * answers for this request, is `edit` or `own`. That's everyone on your own machine
 * (`GE_AUTH_MODE=none`), only the editor on the private preview (docs/ops/preview.md), and with
 * accounts, the universe's owner and editors. Signing in or out refetches it.
 */
export function useCanEdit(): boolean {
  const { universeSlug } = useParams();
  const access = useUniverseBySlug(universeSlug).data?.access;
  return access === 'edit' || access === 'own';
}

/**
 * Whether this reader may start a universe (or make anything at all): locally everyone but the
 * preview's readers, and with accounts, anyone signed in (`canEdit` in /api/health).
 */
export function useCanCreate(): boolean {
  return useHealth().data?.canEdit === true;
}
