/**
 * Where to go after signing in (M8-T1): `?next=` if it's a path on this site, else the home
 * page. A value such as `//evil.example` or `https://…` would leave the site, so only plain
 * paths count.
 */
export function safeNext(next: string | null): string {
  return next?.startsWith('/') && !next.startsWith('//') && !next.startsWith('/\\') ? next : '/';
}
