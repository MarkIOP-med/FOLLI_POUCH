import type { CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { RAIL_ICONS } from '@/domain/diagnosticsAssets';
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
          onClick={() => navigate(item.to)}
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
