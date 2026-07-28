import type { DeviceSnapshot } from '@/api/types';

export interface HardwarePanelProps {
  snapshot: DeviceSnapshot;
  /** i18n key of the in-flight action, or null when idle. */
  busyKey: string | null;
  onStart: () => void;
  onStop: () => void;
  onPause: () => void;
  onEmergency: () => void;
  onRezero: () => void;
}
