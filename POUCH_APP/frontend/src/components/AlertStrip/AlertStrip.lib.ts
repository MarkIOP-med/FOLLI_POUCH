import type { Alert } from '@/api/types';

const SEVERITY_RANK: Record<Alert['severity'], number> = {
  alarm: 0,
  warn: 1,
  info: 2,
};

/**
 * Most severe first, then newest first.
 *
 * The backend already filters `info` out of this feed, but the ordering is defined
 * here so a single alarm can never be buried under a run of warnings.
 */
export function sortAlerts(alerts: Alert[]): Alert[] {
  return [...alerts].sort(
    (a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || b.ts - a.ts,
  );
}

export function formatAlertTime(ts: number, locale?: string): string {
  return new Date(ts * 1000).toLocaleTimeString(locale);
}
