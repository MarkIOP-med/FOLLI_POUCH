import { createBrowserRouter } from 'react-router-dom';

import { AdminScreen } from '@/screens/AdminScreen';
import { DiagnosticsScreen } from '@/screens/DiagnosticsScreen';
import { HomeScreen } from '@/screens/HomeScreen';
import { UsersScreen } from '@/screens/UsersScreen';

/**
 * The four screens of the 2026-07 redesign, and nothing else.
 *
 * Each renders on its own fixed 1920x1200 canvas with the shared chrome, so
 * there is no outer navigation shell — the left icon rail is the navigation.
 */
export const ROUTES = {
  home: '/',
  diagnostics: (id: string) => `/diagnostics/${id}`,
  users: (id: string) => `/users/${id}`,
  admin: (id: string) => `/admin/${id}`,
} as const;

export const router = createBrowserRouter([
  { path: '/', element: <HomeScreen /> },
  { path: '/home', element: <HomeScreen /> },
  { path: '/diagnostics', element: <DiagnosticsScreen /> },
  { path: '/diagnostics/:id', element: <DiagnosticsScreen /> },
  { path: '/users', element: <UsersScreen /> },
  { path: '/users/:id', element: <UsersScreen /> },
  { path: '/admin', element: <AdminScreen /> },
  { path: '/admin/:id', element: <AdminScreen /> },
]);
