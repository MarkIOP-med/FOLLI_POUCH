import { useCallback, useEffect, useState } from 'react';

import { api } from '@/api/client';
import type { DeviceSnapshot } from '@/api/types';

/** Roster refresh cadence. */
export const ROSTER_POLL_MS = 2000;

export interface RosterState {
  devices: DeviceSnapshot[];
  error: string | null;
  refresh: () => Promise<void>;
  toggleConnection: (device: DeviceSnapshot) => Promise<void>;
}

/**
 * Polls the device roster.
 *
 * Deliberately polled rather than streamed: the home grid only needs
 * whole-second granularity, and opening N SSE connections for N pouches is
 * waste. The device screen you actually have open is the one that streams.
 */
/**
 * Last roster fetched, reused as the initial state on a later mount.
 *
 * Without it, navigating back to the home grid painted six empty slots and a
 * blank header for one poll interval before the data landed, which read as a
 * flicker. Caching is honest here because this roster is polled every 2s by
 * design — it is already allowed to be that stale — unlike the 12Hz telemetry in
 * `useDeviceStream`, which is never carried across a remount.
 */
let cachedDevices: DeviceSnapshot[] = [];

export function useRoster(pollMs: number = ROSTER_POLL_MS): RosterState {
  const [devices, setDevices] = useState<DeviceSnapshot[]>(cachedDevices);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      cachedDevices = await api.devices();
      setDevices(cachedDevices);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), pollMs);
    return () => clearInterval(timer);
  }, [refresh, pollMs]);

  const toggleConnection = useCallback(
    async (device: DeviceSnapshot) => {
      try {
        await (device.connected ? api.disconnect(device.id) : api.connect(device.id));
        await refresh();
      } catch (err) {
        setError((err as Error).message);
      }
    },
    [refresh],
  );

  return { devices, error, refresh, toggleConnection };
}
