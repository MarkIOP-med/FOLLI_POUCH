import type { ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { RAIL_ICONS } from '@/domain/diagnosticsAssets';
import { getLastDeviceId } from '@/domain/lastDevice';
import { formatDuration } from '@/domain/status';
import './FluidShell.scss';

export type ShellNav = 'home' | 'diagnostics' | 'users' | 'settings';

export interface FluidShellProps {
  active: ShellNav;
  /** Shown top-left. */
  title?: string;
  connected?: boolean;
  pouchId?: string | null;
  patientName?: string | null;
  sessionElapsedS?: number | null;
  headerExtra?: ReactNode;
  children: ReactNode;
}

const NAV: readonly { icon: ShellNav; to: string; labelKey: string }[] = [
  { icon: 'home', to: '/', labelKey: 'diagnostics.rail.home' },
  { icon: 'diagnostics', to: '/diagnostics', labelKey: 'diagnostics.rail.diagnostics' },
  { icon: 'users', to: '/users', labelKey: 'diagnostics.rail.users' },
  { icon: 'settings', to: '/admin', labelKey: 'diagnostics.rail.admin' },
];

/**
 * A genuinely fluid app shell — CSS grid (header / rail / scrolling main) that
 * fills the viewport at any size, with `clamp()` type that scales from a 10"
 * tablet to a 34" monitor. Replaces the fixed 1920x1200 scaled canvas
 * (AppFrame) as screens migrate onto it, one route at a time.
 */
export function FluidShell({
  active,
  title,
  connected,
  pouchId,
  patientName,
  sessionElapsedS,
  headerExtra,
  children,
}: FluidShellProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const deviceId = id ?? getLastDeviceId();

  const target = (item: (typeof NAV)[number]) =>
    item.icon === 'home' || !deviceId ? '/' : `${item.to}/${deviceId}`;

  return (
    <div className="shell">
      <header className="shell__header">
        <div className="shell__brand">
          <span className="shell__brand-mark">FOLLI</span>
          {title && <span className="shell__title">{title}</span>}
        </div>

        <div className="shell__meta">
          {pouchId != null && (
            <span className="shell__meta-item">
              <span className="shell__meta-label">Pouch</span>
              <span
                className={`shell__dot${connected ? ' is-on' : ' is-off'}`}
                aria-hidden="true"
              />
              {pouchId}
            </span>
          )}
          {patientName != null && (
            <span className="shell__meta-item">
              <span className="shell__meta-label">Patient</span>
              {patientName}
            </span>
          )}
          {sessionElapsedS != null && (
            <span className="shell__meta-item">
              <span className="shell__meta-label">Session</span>
              {formatDuration(sessionElapsedS) ?? '00:00'}
            </span>
          )}
          {headerExtra}
        </div>
      </header>

      <nav className="shell__rail" aria-label={t('diagnostics.rail.label')}>
        {NAV.map((item) => (
          <button
            key={item.icon}
            type="button"
            className={`shell__nav${item.icon === active ? ' is-active' : ''}`}
            aria-current={item.icon === active ? 'page' : undefined}
            title={t(item.labelKey)}
            onClick={() => navigate(target(item))}
          >
            <span
              className="shell__nav-icon"
              role="img"
              aria-label={t(item.labelKey)}
              style={{
                maskImage: `url(${RAIL_ICONS[item.icon]})`,
                WebkitMaskImage: `url(${RAIL_ICONS[item.icon]})`,
              }}
            />
            <span className="shell__nav-label">{t(item.labelKey)}</span>
          </button>
        ))}
      </nav>

      <main className="shell__main">{children}</main>
    </div>
  );
}
