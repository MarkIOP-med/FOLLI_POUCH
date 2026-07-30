import type { DeviceSnapshot } from '@/api/types';

export interface RosterState {
  devices: DeviceSnapshot[];
  error: string | null;
  refresh: () => Promise<void>;
  toggleConnection: (device: DeviceSnapshot) => Promise<void>;
}
