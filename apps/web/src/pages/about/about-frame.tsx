import type { ReactNode } from 'react';
import { Link, NavLink } from 'react-router';
import { ABOUT_PAGES } from '@/app/about-links.tsx';
import { usePageTitle } from '@/app/use-page-title.ts';
import { cn } from '@/lib/utils.ts';
import { PAGE_PANEL } from '@/app/panel-classes.ts';

/**
 * The panel the About pages share: a scrolling column of text over the canvas, as the account
 * page's, with links between the pages and back to the universes.
 */
export function AboutFrame({ title, children }: { title: string; children: ReactNode }) {
  usePageTitle([title]);
  return (
    <main
      className={`${PAGE_PANEL} flex max-h-[calc(100%-5rem)] w-[28rem] flex-col gap-5 overflow-y-auto rounded-lg border bg-card p-4 text-sm leading-relaxed`}
    >
      <nav aria-label="About this site" className="flex gap-3 text-xs">
        {ABOUT_PAGES.map((page) => (
          <NavLink
            key={page.path}
            to={page.path}
            className={({ isActive }) =>
              cn('underline-offset-2', isActive ? 'font-medium' : 'text-primary underline')
            }
          >
            {page.title}
          </NavLink>
        ))}
        <Link to="/" className="ml-auto text-primary underline underline-offset-2">
          All universes
        </Link>
      </nav>
      <h1 className="text-base font-medium">{title}</h1>
      {children}
    </main>
  );
}

/** A titled part of an About page. */
export function AboutSection({
  title,
  id,
  children,
}: {
  title: string;
  id?: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2" aria-labelledby={id ? `${id}-title` : undefined}>
      <h2 id={id ? `${id}-title` : undefined} className="font-medium">
        {title}
      </h2>
      {children}
    </section>
  );
}

/** A link that leaves the site: in a new tab, telling the other site nothing about this one. */
export function OutLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="text-primary underline break-words">
      {children}
    </a>
  );
}
