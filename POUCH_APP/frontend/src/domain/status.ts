import type { FsrReading, ZoneStatus } from '@/api/types';

/**
 * Status → CSS modifier. Deliberately returns a class, not a label: all copy
 * lives in i18n under `status.*`, keyed by the same ZoneStatus value.
 */
export const STATUS_CLASS: Record<ZoneStatus, string> = {
  OK: 'is-ok',
  SETTLING: 'is-settling',
  OUT_OF_BAND: 'is-band',
  SENSOR_FAULT: 'is-fault',
  NO_DATA: 'is-nodata',
};

export type FsrDisplayKind = 'value' | 'fault' | 'none';

export interface FsrDisplay {
  kind: FsrDisplayKind;
  /** Only set when kind === 'value'. */
  value: number | null;
  className: string;
}

/**
 * A railed FSR (4095 = open circuit) must never render as a number or a computed
 * Newton value — that presents the absence of data as data. EAR is stubbed to 0
 * in firmware and is 'none', which is not the same thing as a fault.
 */
export function fsrDisplay(reading: FsrReading | null): FsrDisplay {
  if (!reading) return { kind: 'none', value: null, className: 'fsr--none' };

  switch (reading.state) {
    case 'FAULT':
      return { kind: 'fault', value: null, className: 'fsr--fault' };
    case 'NOT_IMPLEMENTED':
      return { kind: 'none', value: null, className: 'fsr--none' };
    default:
      return { kind: 'value', value: reading.raw, className: 'fsr--ok' };
  }
}

/** `h:mm:ss` past an hour, `mm:ss` below it. Returns null when there is nothing to show. */
export function formatDuration(seconds: number | null | undefined): string | null {
  if (seconds == null) return null;

  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = String(Math.floor((total % 3600) / 60)).padStart(2, '0');
  const secs = String(total % 60).padStart(2, '0');

  return hours > 0 ? `${hours}:${minutes}:${secs}` : `${minutes}:${secs}`;
}
