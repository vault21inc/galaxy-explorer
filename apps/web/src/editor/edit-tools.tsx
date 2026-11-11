import { useEditView } from '@/levels/use-edit-view.ts';
import { LocatedPlacement } from './located-placement.tsx';
import { MoveTool } from './move-tool.tsx';
import { PinDrag } from './pin-drag.tsx';
import { Placement } from './placement.tsx';

/**
 * The canvas tools every editable view shares (M5-T4): placing a new object and moving the
 * selection. They read the view from the navigation stack and its settings from the levels
 * registry, so the galaxy and system views mount the same component.
 */
export function EditTools() {
  const view = useEditView();
  if (!view?.payload) return null;
  return (
    <>
      <Placement view={view} />
      <LocatedPlacement view={view} />
      <MoveTool view={view} />
      <PinDrag view={view} />
    </>
  );
}
