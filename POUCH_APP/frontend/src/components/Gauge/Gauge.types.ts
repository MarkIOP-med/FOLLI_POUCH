export interface GaugeProps {
  /** Caption shown beneath the dial. */
  label: string;
  /** Current reading, or null when no telemetry has arrived. */
  value: number | null;
  /** Full-scale value the arc is drawn against. */
  max: number;
  /** Renders the dial as unreadable rather than as zero. */
  fault?: boolean;
}

export interface ArcGeometry {
  /** SVG path for the background track. */
  track: string;
  /** SVG path for the filled portion, or null when the fill is empty. */
  fill: string | null;
  /** Needle end point. */
  needle: readonly [number, number];
}
