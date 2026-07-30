import { useCallback, useEffect, useState } from 'react';

import { api } from '@/api/client';
import type { DeviceSnapshot } from '@/api/types';
import type { RosterState } from './BoardRoster.types';

/** Roster refresh cadence. */
export const ROSTER_POLL_MS = 2000;

/**
 * Polls the device roster.
 *
 * Deliberately polled rather than streamed: the board only needs whole-second
 * granularity, and opening N SSE connections for N pouches is waste. The device
 * screen you actually have open is the one that streams.
 */
export function useRoster(pollMs: number = ROSTER_POLL_MS): RosterState {
  const [devices, setDevices] = useState<DeviceSnapshot[]>([]);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setDevices(await api.devices());
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

export function countInSession(devices: DeviceSnapshot[]): number {
  return devices.filter((device) => device.session_id !== null).length;
}

/** Compact per-zone chip label, e.g. "F40". */
export function zoneChipLabel(zone: string, effectiveMmhg: number): string {
  return `${zone.charAt(0)}${effectiveMmhg}`;
}
