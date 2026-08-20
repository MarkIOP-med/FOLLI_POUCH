/**
 * The clinical arithmetic. Mirrors backend/app/pressure.py — change one, change both.
 * The backend is authoritative; this exists so the UI can preview a value before it
 * round-trips, never so the UI can decide one.
 */

export const CONTROLLER_TOLERANCE_MMHG = 3;

export function clamp(value: number, low: number, high: number): number {
  return Math.max(low, Math.min(high, value));
}

export function effectiveMmhg(
  prescribed: number,
  trimPct: number,
  ceiling: number,
  trimRange = 10,
): number {
  if (prescribed <= 0) return 0; // a zone the clinician turned off cannot be trimmed on

  const trim = clamp(trimPct, -trimRange, trimRange);
  let value = prescribed * (1 + trim / 100);
  value = clamp(
    value,
    prescribed * (1 - trimRange / 100),
    prescribed * (1 + trimRange / 100),
  );
  return Math.round(clamp(value, 0, ceiling));
}

/**
 * False when the trim band is narrower than the controller's own deadband. At Rx 20
 * with ±10% the band is ±2 mmHg against ±3 mmHg tolerance — the patient moves the
 * control and nothing measurable happens, so the UI greys it out instead.
 */
export function trimIsMeaningful(prescribed: number, trimRange = 10): boolean {
  if (prescribed <= 0) return false;
  return prescribed * (trimRange / 100) >= CONTROLLER_TOLERANCE_MMHG;
}

/**
 * Parses a pressure entry field, clamped to [0, ceiling]. The input's own
 * min/max are browser-advisory only — a typed 500 arrives here as 500, and it
 * must never leave as more than the ceiling.
 */
export function parseTarget(raw: string, ceiling: number): number {
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.round(clamp(value, 0, ceiling));
}
