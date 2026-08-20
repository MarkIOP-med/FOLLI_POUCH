import type { CSSProperties } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { RAIL_ICONS } from '@/domain/diagnosticsAssets';
import { getLastDeviceId } from '@/domain/lastDevice';
import type { IconRailProps, RailItem } from './IconRail.types';
import './IconRail.scss';

/** Rail destinations, top to bottom, matching the four icons in the mockups. */
const ITEMS: readonly RailItem[] = [
  { icon: 'home', to: '/', labelKey: 'diagnostics.rail.home' },
  { icon: 'diagnostics', to: '/diagnostics', labelKey: 'diagnostics.rail.diagnostics' },
  { icon: 'users', to: '/users', labelKey: 'diagnostics.rail.users' },
  { icon: 'settings', to: '/admin', labelKey: 'diagnostics.rail.admin' },
];

export function IconRail({ active }: IconRailProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  // Navigation must carry the device id: a bare /diagnostics used to fall through
  // to a hardcoded mock device, silently swapping which pouch the screen drives.
  // From an id-less URL (home) the last visited pouch fills in — without it the
  // gear/users icons were unreachable from the home screen.
  const { id } = useParams<{ id: string }>();
  const deviceId = id ?? getLastDeviceId();
  const target = (item: RailItem) =>
    item.icon === 'home' || !deviceId ? '/' : `${item.to}/${deviceId}`;

  return (
    <nav className="icon-rail" aria-label={t('diagnostics.rail.label')}>
      {ITEMS.map((item, index) => (
        <button
          key={item.icon}
          type="button"
          data-icon={item.icon}
          className={`icon-rail__item${item.icon === active ? ' is-active' : ''}`}
          aria-current={item.icon === active ? 'page' : undefined}
          title={t(item.labelKey)}
          style={{ '--rail-index': index } as CSSProperties}
          onClick={() => navigate(target(item))}
        >
          {/* The artwork is black-on-transparent, so it is applied as a mask and
              filled with the designer's grey/white pair rather than rendered as
              an <img> and tinted. */}
          <span
            className="icon-rail__icon"
            role="img"
            aria-label={t(item.labelKey)}
            style={{
              maskImage: `url(${RAIL_ICONS[item.icon]})`,
              WebkitMaskImage: `url(${RAIL_ICONS[item.icon]})`,
            }}
          />
        </button>
      ))}
    </nav>
  );
}
