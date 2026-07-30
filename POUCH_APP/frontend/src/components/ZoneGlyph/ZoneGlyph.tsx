import { useTranslation } from 'react-i18next';

import { ZONE_ART } from '@/domain/assets';
import type { ZoneGlyphProps } from './ZoneGlyph.types';
import './ZoneGlyph.scss';

/**
 * The zone's official tile from SHARED_ASSETS — the same artwork the patient sees
 * on the console, so clinician and patient look at the same picture of the same pad.
 */
export function ZoneGlyph({ zone, active = false, size = 56 }: ZoneGlyphProps) {
  const { t } = useTranslation();
  const art = ZONE_ART[zone];

  if (!art) return null;

  return (
    <img
      className={`zone-glyph${active ? ' zone-glyph--active' : ''}`}
      src={art.tile}
      alt={t('zones.padAlt', { zone: t(`zones.${zone}`) })}
      width={size}
      height={size}
    />
  );
}
