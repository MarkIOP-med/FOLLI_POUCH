import { useCallback, useState } from 'react';

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
  | 'restarting'
  | 'factoryReset'
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

/**
 * Serialises device commands and surfaces their failure.
 *
 * One action at a time by design: these screens drive a pneumatic controller,
 * and overlapping commands would race in the firmware's non-blocking state
 * machine.
 */
export function useDeviceActions(): DeviceActions {
  const [busyKey, setBusyKey] = useState<BusyKey | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async (key: BusyKey, action: () => Promise<unknown>) => {
    setBusyKey(key);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusyKey(null);
    }
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return { busyKey, error, run, clearError };
}
