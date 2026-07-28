import { useCallback, useState } from 'react';

import type { BusyKey, DeviceActions } from './DeviceScreen.types';

/**
 * Serialises device commands and surfaces their failure.
 *
 * One action at a time by design: this screen drives a pneumatic controller, and
 * overlapping commands would race in the firmware's non-blocking state machine.
 */
export function useDeviceActions(): DeviceActions {
  const [busyKey, setBusyKey] = useState<BusyKey | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(
    async (key: BusyKey, action: () => Promise<unknown>) => {
      setBusyKey(key);
      setError(null);
      try {
        await action();
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setBusyKey(null);
      }
    },
    [],
  );

  const clearError = useCallback(() => setError(null), []);

  return { busyKey, error, run, clearError };
}
