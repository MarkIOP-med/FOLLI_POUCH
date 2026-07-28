import { createBrowserRouter } from 'react-router-dom';

import { AppShell } from '@/components/AppShell';
import { BoardRoster } from '@/screens/BoardRoster';
import { DeviceScreen } from '@/screens/DeviceScreen';
import { PatientDetail } from '@/screens/PatientDetail';
import { Patients } from '@/screens/Patients';
import { SettingsScreen } from '@/screens/Settings';

export const ROUTES = {
  board: '/',
  device: (id: string) => `/devices/${id}`,
  patients: '/patients',
  patient: (id: number | string) => `/patients/${id}`,
  settings: '/settings',
} as const;

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <BoardRoster /> },
      { path: 'devices/:id', element: <DeviceScreen /> },
      { path: 'patients', element: <Patients /> },
      { path: 'patients/:id', element: <PatientDetail /> },
      { path: 'settings', element: <SettingsScreen /> },
    ],
  },
]);
