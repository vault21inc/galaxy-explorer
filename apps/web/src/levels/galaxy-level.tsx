import { useMemo } from 'react';
import { useViewPayload } from '@/api/hooks.ts';
import { useReadOptions } from '@/api/read-options.ts';
import { MoveTool } from '@/editor/move-tool.tsx';
import { Placement } from '@/editor/placement.tsx';
import { GalaxyBackground } from '@/render/galaxy/galaxy-background.tsx';
import { SelectionRings } from '@/render/picking/selection-rings.tsx';
import { partitionByRenderer } from '@/render/registry.ts';

/**
 * The galaxy view (rendering.md §6), drawn inside the canvas: the background, then each
 * renderer from the registry with the objects it draws. It reads the same payload the map page
 * loads, from TanStack Query's cache.
 */
export default function GalaxyLevel({ subjectId }: { subjectId: string }) {
  const view = useViewPayload('galaxy', subjectId, useReadOptions());
  const groups = useMemo(
    () => (view.data ? partitionByRenderer('galaxy', view.data.objects) : []),
    [view.data],
  );
  if (!view.data) return null;
  return (
    <>
      <GalaxyBackground mapId={subjectId} settings={view.data.map.galaxySettings} />
      {groups.map(({ renderer, objects }) => (
        <renderer.component key={renderer.name} objects={objects} />
      ))}
      <SelectionRings />
      <Placement mapId={subjectId} />
      <MoveTool mapId={subjectId} />
    </>
  );
}
