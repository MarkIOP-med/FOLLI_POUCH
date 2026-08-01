import type { RailIcon } from '@/domain/diagnosticsAssets';

export interface RailItem {
  icon: RailIcon;
  to: string;
  labelKey: string;
}

export interface IconRailProps {
  /** Which destination is currently shown. */
  active: RailIcon;
}
