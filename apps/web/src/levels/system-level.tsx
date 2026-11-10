import { useMemo } from 'react';
import { useViewPayload } from '@/api/hooks.ts';
import { useReadOptions } from '@/api/read-options.ts';
import { useViewCamera } from '@/render/camera/use-view-camera.ts';
import { SelectionRings } from '@/render/picking/selection-rings.tsx';
import { partitionByRenderer } from '@/render/registry.ts';
import { OrbitRings } from '@/render/orbits/orbit-rings.tsx';
import { GalaxyBand } from '@/render/system/galaxy-band.tsx';
import { systemCamera } from '@/render/system/system-camera.ts';

/**
 * The system view (rendering.md §7), drawn inside the canvas, in system units: the galaxy band
 * behind the sky's stars, the orbit rings, and the system's direct children, each through its
 * renderer from the registry (stars, planets, belts, icons). M5-T4 brings the editing tools.
 */
export default function SystemLevel({ subjectId }: { subjectId: string }) {
  const view = useViewPayload('system', subjectId, useReadOptions());
  const partitions = useMemo(
    () => (view.data ? partitionByRenderer('system', view.data.children) : []),
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
    </>
  );
}
