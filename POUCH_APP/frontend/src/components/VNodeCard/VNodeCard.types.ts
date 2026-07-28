import type { Zone, ZoneView } from '@/api/types';

export interface VNodeCardProps {
  zone: ZoneView;
  /** App-wide pressure ceiling; clamps the input. */
  ceiling: number;
  /** Service mode swaps the Rx/trim stack for a single setpoint field. */
  serviceMode: boolean;
  disabled?: boolean;
  onTarget: (zone: Zone, mmhg: number) => void;
}

export interface TrimSummary {
  /** Rendered trim, e.g. "+10%", or null when the zone is off. */
  label: string | null;
  /** Signed mmHg the trim contributes, or null when it contributes nothing. */
  deltaLabel: string | null;
  /** True when the trim band is wider than the controller deadband. */
  meaningful: boolean;
}
