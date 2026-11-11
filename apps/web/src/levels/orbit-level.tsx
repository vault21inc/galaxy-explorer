import { useMemo } from 'react';
import { useViewPayload } from '@/api/hooks.ts';
import { useReadOptions } from '@/api/read-options.ts';
import { EditTools } from '@/editor/edit-tools.tsx';
import { useViewCamera } from '@/render/camera/use-view-camera.ts';
import { Globe } from '@/render/globe/globe.tsx';
import { globeSun } from '@/render/globe/globe-sun.ts';
import { orbitCamera } from '@/render/globe/orbit-camera.ts';
import { OrbitRings } from '@/render/orbits/orbit-rings.tsx';
import { SelectionRings } from '@/render/picking/selection-rings.tsx';
import { partitionByRenderer } from '@/render/registry.ts';
import { GalaxyBand } from '@/render/system/galaxy-band.tsx';

/**
 * The orbit view (rendering.md §8, M6-T3), in body radii around the subject: the galaxy band
 * behind the sky's stars, the globe at the center, and what orbits it (moons, stations,
 * markers) through their renderers from the registry, with their orbit rings, and the editing
 * tools. A moon that's explorable opens its own orbit view (O4).
 */
export default function OrbitLevel({ subjectId }: { subjectId: string }) {
  const view = useViewPayload('orbit', subjectId, useReadOptions());
  const partitions = useMemo(
    () => (view.data ? partitionByRenderer('orbit', view.data.children) : []),
    [view.data],
  );
  useViewCamera(
    view.data
      ? orbitCamera(subjectId, view.data.children, globeSun(view.data.sunlight).direction)
      : null,
  );
  if (!view.data) return null;
  return (
    <>
      <GalaxyBand />
      <Globe
        subject={view.data.subject}
        sunlight={view.data.sunlight}
        pins={view.data.pins}
        universeId={view.data.map.universeId}
      />
      <OrbitRings objects={view.data.children} />
      {partitions.map(({ renderer, objects }) => (
        <renderer.component key={renderer.name} objects={objects} />
      ))}
      <SelectionRings />
      {/* Placing and moving what orbits the globe, the same tools as the other views'. */}
      <EditTools />
    </>
  );
}
