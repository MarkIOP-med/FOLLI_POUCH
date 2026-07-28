import { useEffect, useState } from 'react';
import type { DeviceSnapshot } from './types';

/**
 * One SSE subscription per open device screen.
 *
 * SSE rather than polling: telemetry lands at ~12 Hz, which a poll loop cannot
 * track. The stream is deliberately scoped to this hook so it dies on unmount --
 * 12 Hz data has no business in a global store.
 */
export function useDeviceStream(deviceId: string | undefined) {
  const [snapshot, setSnapshot] = useState<DeviceSnapshot | null>(null);
  const [streamError, setStreamError] = useState<string | null>(null);

  useEffect(() => {
    if (!deviceId) return;
    setSnapshot(null);
    setStreamError(null);

    const source = new EventSource(`/api/devices/${deviceId}/stream`);

    source.onmessage = (event) => {
      try {
        setSnapshot(JSON.parse(event.data) as DeviceSnapshot);
        setStreamError(null);
      } catch {
        /* a truncated frame is not worth surfacing; the next one arrives in 200ms */
      }
    };

    // EventSource reconnects on its own; surface the gap rather than hiding it,
    // because a stale pressure reading that looks live is dangerous.
    source.onerror = () => setStreamError('stream interrupted — reconnecting');

    return () => source.close();
  }, [deviceId]);

  return { snapshot, streamError };
}
