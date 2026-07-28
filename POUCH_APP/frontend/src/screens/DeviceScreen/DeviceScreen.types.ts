/** i18n key under `device.busy.*` describing the in-flight action. */
export type BusyKey =
  | 'applying'
  | 'stopping'
  | 'pausing'
  | 'venting'
  | 'rezeroing'
  | 'settingTarget'
  | 'settingVibration'
  | 'resetting'
  | 'promoting'
  | 'endingSession'
  | 'startingService'
  | 'loadingPatient'
  | 'acking';

export interface DeviceActions {
  busyKey: BusyKey | null;
  error: string | null;
  run: (key: BusyKey, action: () => Promise<unknown>) => Promise<void>;
  clearError: () => void;
}
