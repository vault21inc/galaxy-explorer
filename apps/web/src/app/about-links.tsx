import { Link } from 'react-router';

/**
 * The pages about the site itself (M8-T9), in the order their links show: on the home page,
 * and between the pages themselves. The Help menu (M8-T10) adds them too.
 */
export const ABOUT_PAGES = [
  { path: '/about/attributions', title: 'Attributions' },
  { path: '/about/privacy', title: 'Privacy' },
] as const;

/** "Attributions · Privacy", as small links. */
export function AboutLinks({ className }: { className?: string }) {
  return (
    <nav aria-label="About this site" className={className}>
      {ABOUT_PAGES.map((page, index) => (
        <span key={page.path}>
          {index > 0 && ' · '}
          <Link to={page.path} className="underline underline-offset-2">
            {page.title}
          </Link>
        </span>
      ))}
    </nav>
  );
}
