/**
 * Which keyboard convention applies: on macOS the primary modifier is Cmd, elsewhere Ctrl
 * (ux.md §3). Read from the user agent: `navigator.userAgentData` where the browser has it
 * (Chromium), otherwise the user-agent string, which says "Macintosh" in Safari on macOS and
 * on iPads.
 */
export type Platform = 'mac' | 'other';

export function detectPlatform(nav: Pick<Navigator, 'userAgent'> = navigator): Platform {
  const hinted = (nav as { userAgentData?: { platform?: string } }).userAgentData?.platform;
  const source = hinted ?? nav.userAgent;
  return /mac|iphone|ipad|ipod/i.test(source) ? 'mac' : 'other';
}
