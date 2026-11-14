import { createBrowserRouter } from 'react-router';
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
    children: [
      { path: '/', element: <HomePage /> },
      // Signing in and account links (M8-T1): loaded on first visit, as most readers never need them.
      {
        path: '/login',
        lazy: async () => ({ Component: (await import('@/pages/login-page.tsx')).LoginPage }),
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
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);
