/**
 * The security headers (M8-T3, architecture.md §14), kept in one place for the three things
 * that send them:
 * - Caddy, on every response of the site: `ops/caddy/security-headers.caddy` is generated
 *   from this file (`pnpm headers:caddy`), and a unit test fails while it's out of date;
 * - the API, as a fallback for whatever reaches it without Caddy (apps/api/src/http/
 *   security-headers.ts), with a policy of its own, since it serves data, not pages;
 * - `vite preview`, so the e2e tests run the production build under the production policy.
 *
 * The development server (`pnpm dev`) sends none of them: its hot reloading runs inline
 * scripts, which the policy forbids.
 */

/** A Content-Security-Policy, directive by directive. */
export type ContentSecurityPolicy = Readonly<Record<string, readonly string[]>>;

/**
 * The web app's policy: everything comes from the site itself, and nothing runs that isn't one
 * of its own script files.
 */
export const WEB_APP_CSP: ContentSecurityPolicy = {
  'default-src': ["'self'"],
  // The app's own bundles only: no inline scripts, no event-handler attributes, no eval.
  'script-src': ["'self'"],
  // The app's stylesheet, plus inline styles: Radix's dialogs and menus lock the page's scroll
  // with a <style> element written at run time (react-remove-scroll), with sizes measured on
  // the page, so neither a hash nor a nonce (the app is static files) could allow just that.
  // Styles can't run code; scripts stay strict above. (Styling from script, as React's
  // `style` prop does, goes through the CSSOM, which the policy doesn't govern anyway.)
  'style-src': ["'self'", "'unsafe-inline'"],
  // The site's images, plus the data: and blob: URLs the browser and three.js make for
  // generated images and textures.
  'img-src': ["'self'", 'data:', 'blob:'],
  'font-src': ["'self'"],
  // The API is on the same origin; the app talks to nothing else.
  'connect-src': ["'self'"],
  // The galaxy's point cloud is built in a Web Worker (src/workers/), from the site's files.
  'worker-src': ["'self'", 'blob:'],
  'manifest-src': ["'self'"],
  'object-src': ["'none'"],
  // Nothing may change where relative links point, or where forms send.
  'base-uri': ["'self'"],
  'form-action': ["'self'"],
  // No other site may show this one in a frame (clickjacking).
  'frame-ancestors': ["'none'"],
};

/**
 * The API's policy: it answers with JSON, Markdown and images, never a page that should run
 * or load anything, so a response opened as a page can do nothing at all.
 */
export const API_CSP: ContentSecurityPolicy = {
  'default-src': ["'none'"],
  'frame-ancestors': ["'none'"],
};

/** The header's text: `default-src 'self'; script-src 'self'; …`. */
export function cspHeader(policy: ContentSecurityPolicy): string {
  return Object.entries(policy)
    .map(([directive, sources]) => [directive, ...sources].join(' '))
    .join('; ');
}

/**
 * Browser features the app never uses, turned off for it and for anything embedded in it
 * (`Permissions-Policy`). A feature the app starts using has to come off this list.
 */
export const DISABLED_FEATURES = [
  'accelerometer',
  'autoplay',
  'bluetooth',
  'camera',
  'display-capture',
  'encrypted-media',
  'fullscreen',
  'geolocation',
  'gyroscope',
  'hid',
  'idle-detection',
  'magnetometer',
  'microphone',
  'midi',
  'payment',
  'picture-in-picture',
  'publickey-credentials-get',
  'screen-wake-lock',
  'serial',
  'usb',
  'xr-spatial-tracking',
] as const;

/** One year, in seconds: how long browsers keep to HTTPS once they've seen the site. */
const HSTS_MAX_AGE_S = 365 * 24 * 60 * 60;

/**
 * The headers every response carries, page or not. The Content-Security-Policy is apart
 * (`WEB_APP_CSP`, `API_CSP`), since pages and data need different ones.
 */
export const SECURITY_HEADERS: Readonly<Record<string, string>> = {
  // HTTPS only, from the first visit on. Browsers ignore it over plain HTTP, as in development.
  'Strict-Transport-Security': `max-age=${String(HSTS_MAX_AGE_S)}`,
  // A file is what its Content-Type says, never what the browser guesses from its bytes.
  'X-Content-Type-Options': 'nosniff',
  // Other sites learn the origin a visitor came from, not the page (whose address can hold a
  // share key, `/u/{slug}?k=…`).
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  // `frame-ancestors 'none'` for browsers that predate it.
  'X-Frame-Options': 'DENY',
  // A page this one opens in a new tab can't reach back into it through `window.opener`.
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Permissions-Policy': DISABLED_FEATURES.map((feature) => `${feature}=()`).join(', '),
};

/** What a page of the web app is sent with: the common headers and the app's policy. */
export const WEB_APP_HEADERS: Readonly<Record<string, string>> = {
  ...SECURITY_HEADERS,
  'Content-Security-Policy': cspHeader(WEB_APP_CSP),
};
