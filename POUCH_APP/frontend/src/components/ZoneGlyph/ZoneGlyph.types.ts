import type { Zone } from '@/api/types';

export interface ZoneGlyphProps {
  zone: Zone;
  /** Dims the tile when the zone is prescribed 0. */
  active?: boolean;
  size?: number;
}
