import type { Zone, ZoneView } from '@/api/types';

export interface VibrationTableProps {
  zones: ZoneView[];
  disabled: boolean;
  onSet: (zone: Zone, level: number) => void;
}
