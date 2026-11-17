import { viewLink } from '@/lib/camera-param.ts';
import { currentCameraPose } from '@/render/transition/transition-controller.ts';
import { useToasts } from '@/state/toasts.ts';

/**
 * Copies the address of the view on screen, with the camera where it is now (`?cam=`, ux.md
 * §9), so whoever opens it sees the same thing: the view, the selection, and the camera.
 */
export async function copyViewLink(): Promise<void> {
  const toasts = useToasts.getState();
  const pose = currentCameraPose();
  if (!pose) {
    toasts.show('There’s no view on screen to link to.', 'error');
    return;
  }
  const link = viewLink(window.location, pose);
  try {
    await navigator.clipboard.writeText(link);
    toasts.show('Link to this view copied', 'info');
  } catch {
    // Some browsers refuse the clipboard without a click's permission: show the link instead.
    toasts.show(`Couldn’t copy. The link: ${link}`, 'error');
  }
}
