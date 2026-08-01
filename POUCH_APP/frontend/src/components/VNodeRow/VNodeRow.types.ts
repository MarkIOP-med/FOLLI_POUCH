import type { Gender, Zone, ZoneView } from '@/api/types';

export interface VNodeRowProps {
  zone: ZoneView;
  gender: Gender;
  ceiling: number;
  disabled: boolean;
  onSet: (zone: Zone, mmhg: number) => void;
}
