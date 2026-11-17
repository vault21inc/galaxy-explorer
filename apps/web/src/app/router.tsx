import { createBrowserRouter, type RouteObject } from 'react-router';
import { ErrorPage } from '@/pages/error-page.tsx';
import { HomePage } from '@/pages/home-page.tsx';
import { MapPage } from '@/pages/map-page.tsx';
import { NotFoundPage } from '@/pages/not-found-page.tsx';
import { UniversePage } from '@/pages/universe-page.tsx';
import { AppShell } from './app-shell.tsx';

/**
 * The routes (ux.md §9). Every page renders inside AppShell, so the canvas isn't recreated on
 * navigation, and every state is a URL: Back and Forward move between maps and views.
 */
export const router = createBrowserRouter([
  {
    element: <AppShell />,
    // The shell itself failing (M8-T9): the error page alone, without the canvas.
    errorElement: <ErrorPage />,
    children: [
      {
        // A page failing as it draws, or its code failing to load after a release: the error
        // page in its place, under the top bar.
        errorElement: <ErrorPage />,
        children: pages(),
      },
    ],
  },
]);

/** Every page, as a URL (ux.md §9). */
function pages(): RouteObject[] {
  return [
    { path: '/', element: <HomePage /> },
    // Every universe this reader can open, even where `/` opens the home universe (D-51).
    { path: '/universes', element: <HomePage listOnly /> },
    // Signing in and account links (M8-T1): loaded on first visit, as most readers never need them.
    {
      path: '/login',
      lazy: async () => ({ Component: (await import('@/pages/login-page.tsx')).LoginPage }),
    },
    // The account page and the admin screens (M8-T13), loaded on first visit too.
    {
      path: '/account',
      lazy: async () => ({ Component: (await import('@/pages/account-page.tsx')).AccountPage }),
    },
    {
      path: '/admin',
      lazy: async () => ({ Component: (await import('@/pages/admin/admin-page.tsx')).AdminPage }),
    },
    {
      path: '/link/:token',
      lazy: async () => ({
        Component: (await import('@/pages/account-link-page.tsx')).AccountLinkPage,
      }),
    },
    { path: '/u/:universeSlug', element: <UniversePage /> },
    // A static segment ranks above `:mapSlug`, so no map may use the slug `settings`. Loaded
    // on first visit: its forms bring the rich-text editor, which the galaxy view doesn't need.
    {
      path: '/u/:universeSlug/settings',
      lazy: async () => ({
        Component: (await import('@/pages/universe-settings-page.tsx')).UniverseSettingsPage,
      }),
    },
    { path: '/u/:universeSlug/:mapSlug', element: <MapPage /> },
    // The same page for an object's view, so moving between views doesn't remount it.
    { path: '/u/:universeSlug/:mapSlug/view/:objectId', element: <MapPage /> },
    // About the site (M8-T9): the attributions and the privacy note.
    {
      path: '/about/attributions',
      lazy: async () => ({
        Component: (await import('@/pages/about/attributions-page.tsx')).AttributionsPage,
      }),
    },
    {
      path: '/about/privacy',
      lazy: async () => ({
        Component: (await import('@/pages/about/privacy-page.tsx')).PrivacyPage,
      }),
    },
    { path: '*', element: <NotFoundPage /> },
  ];
}
