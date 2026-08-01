import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { AppFrame } from '@/components/AppFrame';
import { HeaderBand } from '@/components/HeaderBand';
import { IconRail } from '@/components/IconRail';
import { StatusBar } from '@/components/StatusBar';
import { BUTTONS, PROFILE } from '@/domain/diagnosticsAssets';
import { formatDuration } from '@/domain/status';
import { useRoster } from '@/domain/useRoster';
import { APP_VERSION, useHeaderUsers } from '@/screens/DiagnosticsScreen/DiagnosticsScreen.lib';
import './HomeScreen.scss';

/** Minimum tiles drawn, so a small ward still fills the mockup's 3x2 grid. */
const MIN_SLOTS = 6;

/** PAGE_01 — home. One card per pouch, with its patient and session. */
export function HomeScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { devices } = useRoster();
  const { users } = useHeaderUsers();

  const noData = t('diagnostics.noData');
  const active = devices.filter((d) => d.session_id !== null).length;
  const lead = devices.find((d) => d.patient) ?? devices[0] ?? null;
  const blanks = Math.max(0, MIN_SLOTS - devices.length);

  return (
    <AppFrame>
      <StatusBar batteryPercent={null} online={devices.some((d) => d.connected)} />
      <HeaderBand
        version={APP_VERSION}
        users={users}
        selectedUserId={lead?.patient?.id ?? null}
        onSelectUser={() => undefined}
        consoleId={null}
        pouchId={lead?.id ?? null}
        connected={lead?.connected ?? false}
        sessionElapsedS={lead?.session_elapsed_s ?? null}
      />
      <IconRail active="home" />

      <div className="home-screen__grid">
        {devices.map((device, index) => (
          <article
            key={device.id}
            /* Only the pouch the header is showing carries the highlight —
               slot 01 in the mockup, not every occupied slot. */
            className={`user-card${device.id === lead?.id ? ' user-card--active' : ''}`}
          >
            <header className="user-card__head">
              <span>{t('diagnostics.home.cardTitle')}</span>
              <span>{String(index + 1).padStart(2, '0')}</span>
            </header>

            <div className="user-card__body">
              <span className="user-card__label">{t('diagnostics.home.name')}</span>
              <span>{device.patient?.full_name ?? noData}</span>

              <span className="user-card__label">{t('diagnostics.home.console')}</span>
              <span>{noData}</span>

              <span className="user-card__label">{t('diagnostics.home.pouch')}</span>
              <span>{device.id}</span>

              <span className="user-card__label">{t('diagnostics.home.timeRemain')}</span>
              <span>{formatDuration(device.session_elapsed_s) ?? noData}</span>
            </div>

            {device.patient && (
              <img
                className="user-card__profile"
                src={PROFILE[device.patient.gender ?? 'female'].NONE}
                alt=""
              />
            )}

            <button
              type="button"
              className="user-card__enter"
              disabled={!device.connected}
              onClick={() => navigate(`/diagnostics/${device.id}`)}
            >
              <img src={BUTTONS.enter} alt={t('diagnostics.home.enter')} />
            </button>
          </article>
        ))}

        {/* Empty slots, styled as slot 06 in the mockup. */}
        {Array.from({ length: blanks }, (_, i) => (
          <article key={`empty-${i}`} className="user-card user-card--empty">
            <header className="user-card__head">
              <span>{t('diagnostics.home.cardTitle')}</span>
              <span className="user-card__index">
                {String(devices.length + i + 1).padStart(2, '0')}
              </span>
            </header>
            <div className="user-card__body">
              <span className="user-card__label">{t('diagnostics.home.name')}</span>
              <span />
              <span className="user-card__label">{t('diagnostics.home.console')}</span>
              <span />
              <span className="user-card__label">{t('diagnostics.home.pouch')}</span>
              <span />
              <span className="user-card__label">{t('diagnostics.home.timeRemain')}</span>
              <span />
            </div>
            {/* Slot 06 in the mockup: fields present, no ENTER. */}
          </article>
        ))}
      </div>

      <div className="home-screen__count">
        {t('diagnostics.home.activeUsers', { count: active })}
      </div>
    </AppFrame>
  );
}
