import type { CameraPose } from '@/state/navigation-stack.ts';

/**
 * `?cam=` (ux.md §9): the camera a link opens its view with, so a shared link shows what its
 * sender saw. Six numbers, the camera's position then the point it looks at, in the view's own
 * frame and unit (light-years in the galaxy view, system units in a system, body radii in an
 * orbit view; data-model §5): `cam=px,py,pz,tx,ty,tz`.
 *
 * It's where the view starts, not a record of the camera: moving around doesn't rewrite the
 * address (that would be a history write per frame). "Copy link to this view" makes a new one.
 */
export const CAMERA_PARAM = 'cam';

/** Six significant digits: a light-year at the galaxy's edge, finer than any pixel nearer in. */
const DIGITS = 6;
/** Larger than any frame reaches (±500,000 ly), so a mistyped value can't throw the camera out. */
const LIMIT = 10_000_000;

export function formatCameraParam(pose: CameraPose): string {
  return [...pose.position, ...pose.target]
    .map((n) => String(Number(n.toPrecision(DIGITS))))
    .join(',');
}

/** The pose a `cam` value names, or null when there's none or it isn't six sane numbers. */
export function parseCameraParam(value: string | null): CameraPose | null {
  if (value === null) return null;
  const parts = value.split(',');
  if (parts.length !== 6) return null;
  const numbers = parts.map((part) => (part.trim() === '' ? Number.NaN : Number(part)));
  if (numbers.some((n) => !Number.isFinite(n) || Math.abs(n) > LIMIT)) return null;
  const [px = 0, py = 0, pz = 0, tx = 0, ty = 0, tz = 0] = numbers;
  // A camera on its own target has no direction to look in.
  if (px === tx && py === ty && pz === tz) return null;
  return { position: [px, py, pz], target: [tx, ty, tz] };
}

/**
 * The address of the view on screen, with the camera where it is now: the page's own path and
 * query (the selection, a share link's key), with `cam` set.
 */
export function viewLink(
  location: { origin: string; pathname: string; search: string },
  pose: CameraPose,
): string {
  const params = new URLSearchParams(location.search);
  params.set(CAMERA_PARAM, formatCameraParam(pose));
  // Commas are safe in a query; leaving them unescaped keeps the link readable.
  return `${location.origin}${location.pathname}?${params.toString().replace(/%2C/g, ',')}`;
}
