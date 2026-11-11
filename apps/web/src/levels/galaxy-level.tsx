import { useMemo } from 'react';
import { useViewPayload } from '@/api/hooks.ts';
import { useReadOptions } from '@/api/read-options.ts';
import { EditTools } from '@/editor/edit-tools.tsx';
import { resolveGalaxySettings } from '@ge/domain';
import { useViewCamera } from '@/render/camera/use-view-camera.ts';
import { galaxyCamera } from '@/render/galaxy/galaxy-camera.ts';
import { GalaxyBackground } from '@/render/galaxy/galaxy-background.tsx';
import { EventMarkers } from '@/render/markers/event-markers.tsx';
import { GroupOutlines } from '@/render/groups/group-outlines.tsx';
import { RouteLines } from '@/render/routes/route-lines.tsx';
import { SelectionRings } from '@/render/picking/selection-rings.tsx';
import { partitionByRenderer } from '@/render/registry.ts';
import { UnderlayImage } from '@/render/galaxy/underlay.tsx';
import { useEditor } from '@/state/editor.ts';
import { useGalaxyPreview } from '@/state/galaxy-preview.ts';
import { useRegionPreview } from '@/state/region-preview.ts';
import { RegionHandles } from '@/editor/region-handles.tsx';
import { RouteTool } from '@/editor/route-tool.tsx';

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
  const partitions = useMemo(
    () => (view.data ? partitionByRenderer('galaxy', view.data.objects) : []),
    [view.data],
  );
  // A region being reshaped (M4-T6) is drawn with its preview settings. Only its renderer gets
  // a new list, so the others keep their buffers.
  const regionPreview = useRegionPreview((state) => state.preview);
  const groups = useMemo(() => {
    if (!regionPreview) return partitions;
    return partitions.map((partition) =>
      partition.objects.some((object) => object.id === regionPreview.id)
        ? {
            ...partition,
            objects: partition.objects.map((object) =>
              object.id === regionPreview.id
                ? {
                    ...object,
                    appearance: {
                      ...object.appearance,
                      region: { ...object.appearance.region, ...regionPreview.region },
                    },
                  }
                : object,
            ),
          }
        : partition,
    );
  }, [partitions, regionPreview]);
  const editing = useEditor((state) => state.editing);
  // The camera's limits and starting pose follow the saved settings, not a preview.
  useViewCamera(
    view.data
      ? galaxyCamera(
          subjectId,
          resolveGalaxySettings(view.data.map.galaxySettings),
          view.data.objects,
        )
      : null,
  );
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
      <RouteLines routes={view.data.routes} objects={view.data.objects} />
      {groups.map(({ renderer, objects }) => (
        <renderer.component key={renderer.name} objects={objects} />
      ))}
      {/* Events in deep space or at a system (M6-T5). */}
      <EventMarkers
        markers={view.data.markers}
        objects={view.data.objects}
        universeId={view.data.map.universeId}
      />
      <SelectionRings />
      {editing && <RegionHandles objects={view.data.objects} />}
      {editing && <RouteTool mapId={subjectId} objects={view.data.objects} />}
      <EditTools />
    </>
  );
}
