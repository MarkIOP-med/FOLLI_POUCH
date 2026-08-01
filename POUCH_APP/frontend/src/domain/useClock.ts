import { useEffect, useState } from 'react';

/**
 * A pinned clock, when `?clock=<ISO>` is present.
 *
 * The visual-diff harness sets this to the time printed on the mockup. Comparing
 * a live clock against a static design comp measures nothing except how long ago
 * the mockup was made.
 */
function frozenClock(): Date | null {
  if (typeof window === 'undefined') return null;
  const raw = new URLSearchParams(window.location.search).get('clock');
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** Ticking wall clock for the status bar. */
export function useClock(intervalMs = 1000): Date {
  const pinned = frozenClock();
  const [now, setNow] = useState(() => pinned ?? new Date());

  useEffect(() => {
    if (pinned) return;
    const timer = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(timer);
    // `pinned` comes from the URL and cannot change between renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intervalMs]);

  return pinned ?? now;
}
