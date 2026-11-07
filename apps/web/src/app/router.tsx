import { createBrowserRouter } from 'react-router';
import { HomePage } from '@/pages/home-page.tsx';
import { MapPage } from '@/pages/map-page.tsx';
import { AppShell } from './app-shell.tsx';

/**
 * The routes (ux.md §9). Every page renders inside AppShell, so the canvas isn't recreated on
 * navigation. The system and orbit view routes (`…/view/:objectId`) arrive with M5 and M6.
 */
export const router = createBrowserRouter([
  {
    element: <AppShell />,
    children: [
      { path: '/', element: <HomePage /> },
      { path: '/u/:universeSlug/:mapSlug', element: <MapPage /> },
    ],
  },
]);
