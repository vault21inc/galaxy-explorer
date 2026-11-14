import { useEffect } from 'react';

/**
 * Asks search engines not to index the page while `noIndex` holds (M8-T12): for a universe
 * that's private or link-only. The API sends `X-Robots-Tag: noindex` with everything about such
 * a universe, but crawlers judge the page by its HTML, which is the same app for every address,
 * so the page says it too, with `<meta name="robots" content="noindex">`.
 */
export function useNoIndex(noIndex: boolean): void {
  useEffect(() => {
    if (!noIndex) return;
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex';
    document.head.append(meta);
    return () => {
      meta.remove();
    };
  }, [noIndex]);
}
