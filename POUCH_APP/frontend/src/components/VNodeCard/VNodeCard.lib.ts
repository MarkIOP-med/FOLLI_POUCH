import type { ZoneView } from '@/api/types';
import type { TrimSummary } from './VNodeCard.types';

const sign = (n: number) => (n > 0 ? '+' : '');

/**
 * Presentation of the patient's trim.
 *
 * Prescription, trim and effective pressure are three distinct numbers; the trim
 * belongs to the patient and is never folded into the prescription. Below the
 * controller deadband it is reported as not meaningful rather than shown as a
 * control that silently does nothing.
 */
export function trimSummary(zone: ZoneView): TrimSummary {
  if (zone.prescribed_mmhg === 0) {
    return { label: null, deltaLabel: null, meaningful: false };
  }

  const delta = zone.effective_mmhg - zone.prescribed_mmhg;

  return {
    label: `${sign(zone.trim_pct)}${zone.trim_pct}%`,
    deltaLabel: zone.trim_pct === 0 ? null : `(${sign(delta)}${delta})`,
    meaningful: zone.trim_meaningful,
  };
}

/** Parses the target field, tolerating an emptied input. */
export function parseTarget(raw: string): number {
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? Math.round(value) : 0;
}
