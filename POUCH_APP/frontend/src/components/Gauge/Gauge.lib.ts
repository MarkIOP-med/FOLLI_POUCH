import type { ArcGeometry } from './Gauge.types';

/** Dial geometry, in the 90×78 viewBox the component renders into. */
export const GAUGE = {
  radius: 34,
  cx: 45,
  cy: 45,
  /** Sweep begins at the lower-left and runs 240° clockwise. */
  startAngle: 150,
  sweepAngle: 240,
} as const;

export function polar(degrees: number): readonly [number, number] {
  const rad = (degrees * Math.PI) / 180;
  return [
    GAUGE.cx + GAUGE.radius * Math.cos(rad),
    GAUGE.cy + GAUGE.radius * Math.sin(rad),
  ];
}

function arcPath(from: number, to: number): string {
  const [x1, y1] = polar(from);
  const [x2, y2] = polar(to);
  const largeArc = to - from > 180 ? 1 : 0;
  return `M ${x1} ${y1} A ${GAUGE.radius} ${GAUGE.radius} 0 ${largeArc} 1 ${x2} ${y2}`;
}

/** Clamped 0–1 position of `value` on the dial. */
export function fraction(value: number | null, max: number): number {
  if (value == null || max <= 0) return 0;
  return Math.min(1, Math.max(0, value / max));
}

export function arcGeometry(value: number | null, max: number, fault = false): ArcGeometry {
  const { startAngle, sweepAngle } = GAUGE;
  const frac = fault ? 0 : fraction(value, max);

  return {
    track: arcPath(startAngle, startAngle + sweepAngle),
    fill: frac > 0 ? arcPath(startAngle, startAngle + sweepAngle * frac) : null,
    needle: polar(startAngle + sweepAngle * frac),
  };
}
