import { useMemo } from 'react';
import { useViewPayload } from '@/api/hooks.ts';
import { useReadOptions } from '@/api/read-options.ts';
import { EditTools } from '@/editor/edit-tools.tsx';
import { useViewCamera } from '@/render/camera/use-view-camera.ts';
import { SelectionRings } from '@/render/picking/selection-rings.tsx';
import { partitionByRenderer } from '@/render/registry.ts';
import { OrbitRings } from '@/render/orbits/orbit-rings.tsx';
import { GalaxyBand } from '@/render/system/galaxy-band.tsx';
import { placeSatellites } from '@/render/system/satellites.ts';
import { systemCamera } from '@/render/system/system-camera.ts';

/**
 * The system view (rendering.md §7), drawn inside the canvas, in system units: the galaxy band
 * behind the sky's stars, the orbit rings, and the system's direct children, each through its
 * renderer from the registry (stars, planets, belts, icons), with the planets' moons and
 * stations beside them (system/satellites.ts), and the editing tools.
 */
export default function SystemLevel({ subjectId }: { subjectId: string }) {
  const view = useViewPayload('system', subjectId, useReadOptions());
  // The planets' moons and stations beside them, drawn by the same renderers (and in the same
  // draw calls) as the system's own objects.
  const partitions = useMemo(
    () =>
      view.data
        ? partitionByRenderer('system', [
            ...view.data.children,
            ...placeSatellites(view.data.children, view.data.satellites),
          ])
        : [],
    [view.data],
  );
  useViewCamera(view.data ? systemCamera(subjectId, view.data.children) : null);
  if (!view.data) return null;
  return (
    <>
      <GalaxyBand />
      <OrbitRings objects={view.data.children} />
      {partitions.map(({ renderer, objects }) => (
        <renderer.component key={renderer.name} objects={objects} />
      ))}
      <SelectionRings />
      {/* Placing and moving, the same tools as the galaxy view's (M5-T4). */}
      <EditTools />
    </>
  );
}
