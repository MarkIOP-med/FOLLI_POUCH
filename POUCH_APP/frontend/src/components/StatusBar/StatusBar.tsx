import { useTranslation } from 'react-i18next';

import { useClock } from '@/domain/useClock';
import { LOGO, batteryArt } from '@/domain/diagnosticsAssets';
import type { StatusBarProps } from './StatusBar.types';
import './StatusBar.scss';

/** Weekday, day, month, year — the order the design sets, in any locale. */
function formatStatusDate(now: Date, locale: string): string {
  const part = (options: Intl.DateTimeFormatOptions) =>
    now.toLocaleDateString(locale, options);
  return [
    part({ weekday: 'short' }),
    part({ day: '2-digit' }),
    part({ month: 'short' }),
    part({ year: 'numeric' }),
  ].join(' ');
}

/** Top system bar: brand, tablet battery, connectivity, clock and date. */
export function StatusBar({ batteryPercent = null, online = true }: StatusBarProps) {
  const { t, i18n } = useTranslation();
  const now = useClock();

  const battery = batteryArt(batteryPercent);

  return (
    <header className="status-bar">
      <img className="status-bar__logo" src={LOGO} alt={t('app.brand')} />
      <span className="status-bar__spacer" />

      <span className="status-bar__group">
        {batteryPercent == null ? (
          <>
            <span className="status-bar__muted">{t('common.emDash')}</span>
            <span className="status-bar__battery-none" aria-label={t('common.notReported')} />
          </>
        ) : (
          <>
            <span>{batteryPercent}%</span>
            <img className="status-bar__battery-icon" src={battery ?? undefined} alt="" />
          </>
        )}
      </span>

      <span className="status-bar__group status-bar__wifi-group">
        <svg
          className={`status-bar__wifi${online ? '' : ' status-bar__wifi--off'}`}
          viewBox="0 0 26 20"
          aria-hidden="true"
        >
          <path
            d="M13 18.5 9.2 14.2a5.6 5.6 0 0 1 7.6 0Zm-6.4-7.2-2.4-2.7a13 13 0 0 1 17.6 0l-2.4 2.7a9.4 9.4 0 0 0-12.8 0ZM1.4 5.6 0 4A18.6 18.6 0 0 1 26 4l-1.4 1.6a16.6 16.6 0 0 0-23.2 0Z"
            fill="currentColor"
          />
        </svg>
      </span>

      {/* Formats match the mockup exactly: 24-hour clock with no meridiem, and
          "Thu 20 Jun 2026" — weekday, day, month, year, no commas. */}
      <span className="status-bar__group status-bar__clock-group">
        <span className="status-bar__clock">
          {now.toLocaleTimeString(i18n.language, {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false,
          })}
        </span>
        {/* "Thu 20 Jun 2026" — day before month, no commas. Assembled from parts
            rather than taking the locale's own order, which puts the month first
            under en-US and would not match the design. */}
        <span className="status-bar__date">{formatStatusDate(now, i18n.language)}</span>
      </span>
    </header>
  );
}
