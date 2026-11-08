import { createBrowserRouter } from 'react-router';
import { HomePage } from '@/pages/home-page.tsx';
import { MapPage } from '@/pages/map-page.tsx';
import { NotFoundPage } from '@/pages/not-found-page.tsx';
import { ObjectViewPage } from '@/pages/object-view-page.tsx';
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
      { path: '/u/:universeSlug', element: <UniversePage /> },
      { path: '/u/:universeSlug/:mapSlug', element: <MapPage /> },
      { path: '/u/:universeSlug/:mapSlug/view/:objectId', element: <ObjectViewPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);
