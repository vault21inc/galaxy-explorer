import { useViewPayload } from '@/api/hooks.ts';
import { GalaxyBackground } from '@/render/galaxy/galaxy-background.tsx';

/**
 * The galaxy view (rendering.md §6), drawn inside the canvas. It reads the same payload the
 * map page loads, from TanStack Query's cache. M2-T3 adds the objects and regions.
 */
export default function GalaxyLevel({ subjectId }: { subjectId: string }) {
  const view = useViewPayload('galaxy', subjectId);
  if (!view.data) return null;
  return <GalaxyBackground mapId={subjectId} settings={view.data.map.galaxySettings} />;
}
