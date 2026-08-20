import { useEffect, useRef, useState } from 'react';
import type { DeviceSnapshot } from './types';

/** No frame for this long while a stream is open ⇒ the data on screen is stale. */
const STALE_AFTER_MS = 2500;

/**
 * One SSE subscription per open device screen.
 *
 * SSE rather than polling: telemetry lands at ~5 Hz, which a poll loop cannot
 * track. The stream is deliberately scoped to this hook so it dies on unmount --
 * live data has no business in a global store.
 */
export function useDeviceStream(deviceId: string | undefined) {
  const [snapshot, setSnapshot] = useState<DeviceSnapshot | null>(null);
  const [streamError, setStreamError] = useState<string | null>(null);
  // A stale pressure reading that looks live is dangerous, so the hook tracks
  // frame age itself: `stale` flips when the socket is open but silent — the
  // case EventSource's own error event never fires for.
  const [stale, setStale] = useState(false);
  const lastFrameAt = useRef<number | null>(null);

  useEffect(() => {
    if (!deviceId) return;
    setSnapshot(null);
    setStreamError(null);
    setStale(false);
    lastFrameAt.current = null;

    const source = new EventSource(`/api/devices/${deviceId}/stream`);

    source.onmessage = (event) => {
      try {
        setSnapshot(JSON.parse(event.data) as DeviceSnapshot);
        setStreamError(null);
        lastFrameAt.current = Date.now();
      } catch {
        /* a truncated frame is not worth surfacing; the next one arrives in 200ms */
      }
    };

    // EventSource reconnects on its own; surface the gap rather than hiding it.
    source.onerror = () => setStreamError('stream interrupted — reconnecting');

    const staleTimer = window.setInterval(() => {
      setStale(
        lastFrameAt.current !== null &&
          Date.now() - lastFrameAt.current > STALE_AFTER_MS,
      );
    }, 1000);

    return () => {
      source.close();
      window.clearInterval(staleTimer);
    };
  }, [deviceId]);

  return { snapshot, streamError, stale };
}
