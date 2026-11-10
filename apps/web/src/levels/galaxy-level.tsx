import { useMemo } from 'react';
import { useViewPayload } from '@/api/hooks.ts';
import { useReadOptions } from '@/api/read-options.ts';
import { MoveTool } from '@/editor/move-tool.tsx';
import { Placement } from '@/editor/placement.tsx';
import { resolveGalaxySettings } from '@ge/domain';
import { GalaxyBackground } from '@/render/galaxy/galaxy-background.tsx';
import { GroupOutlines } from '@/render/groups/group-outlines.tsx';
import { SelectionRings } from '@/render/picking/selection-rings.tsx';
import { partitionByRenderer } from '@/render/registry.ts';
import { UnderlayImage } from '@/render/galaxy/underlay.tsx';
import { useEditor } from '@/state/editor.ts';
import { useGalaxyPreview } from '@/state/galaxy-preview.ts';

/**
 * The galaxy view (rendering.md §6), drawn inside the canvas: the background, then each
 * renderer from the registry with the objects it draws. It reads the same payload the map page
 * loads, from TanStack Query's cache.
 */
export default function GalaxyLevel({ subjectId }: { subjectId: string }) {
  const view = useViewPayload('galaxy', subjectId, useReadOptions());
  const preview = useGalaxyPreview((state) =>
    state.preview?.mapId === subjectId ? state.preview : null,
  );
  const groups = useMemo(
    () => (view.data ? partitionByRenderer('galaxy', view.data.objects) : []),
    [view.data],
  );
  const editing = useEditor((state) => state.editing);
  if (!view.data) return null;
  const { underlayAssetId } = view.data.map;
  const underlay = preview?.underlay ?? view.data.map.underlay;
  return (
    <>
      {/* The reference underlay is an editing aid: edit mode only (M3-T8). */}
      {editing && underlay?.visible && underlayAssetId && (
        <UnderlayImage underlay={underlay} assetId={underlayAssetId} />
      )}
      <GalaxyBackground
        mapId={subjectId}
        settings={view.data.map.galaxySettings}
        preview={preview?.galaxySettings ?? null}
      />
      <GroupOutlines
        universeId={view.data.map.universeId}
        groups={view.data.groups}
        groupTypes={view.data.groupTypes}
        objects={view.data.objects}
        galaxyRadiusLy={
          resolveGalaxySettings(preview?.galaxySettings ?? view.data.map.galaxySettings).radiusLy
        }
      />
      {groups.map(({ renderer, objects }) => (
        <renderer.component key={renderer.name} objects={objects} />
      ))}
      <SelectionRings />
      <Placement mapId={subjectId} />
      <MoveTool mapId={subjectId} />
    </>
  );
}
