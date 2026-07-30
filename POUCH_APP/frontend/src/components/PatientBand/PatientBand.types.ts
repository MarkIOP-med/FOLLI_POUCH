import type { DeviceSnapshot } from '@/api/types';

export interface PatientBandProps {
  snapshot: DeviceSnapshot;
  onChange: () => void;
  onRelease: () => void;
}
