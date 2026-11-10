import { useMemo } from 'react';
import { useViewPayload } from '@/api/hooks.ts';
import { useReadOptions } from '@/api/read-options.ts';
import { useViewCamera } from '@/render/camera/use-view-camera.ts';
import { SelectionRings } from '@/render/picking/selection-rings.tsx';
import { partitionByRenderer } from '@/render/registry.ts';
import { systemCamera } from '@/render/system/system-camera.ts';

/**
 * The system view (rendering.md §7), drawn inside the canvas: the system's direct children,
 * each through its renderer from the registry, in system units. M5-T3 gives stars, planets,
 * orbit rings, belts and the background their looks; M5-T4 brings the editing tools.
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
      {partitions.map(({ renderer, objects }) => (
        <renderer.component key={renderer.name} objects={objects} />
      ))}
      <SelectionRings />
    </>
  );
}
