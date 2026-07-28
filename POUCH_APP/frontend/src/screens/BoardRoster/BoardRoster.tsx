import { Link } from 'react-router-dom';
import { Trans, useTranslation } from 'react-i18next';

import { formatDuration } from '@/domain/status';
import { countInSession, useRoster, zoneChipLabel } from './BoardRoster.lib';
import './BoardRoster.scss';

/** The "ICU waiting room" board — every registered pouch at a glance. */
export function BoardRoster() {
  const { t } = useTranslation();
  const { devices, error, toggleConnection } = useRoster();

  return (
    <div className="board">
      <header className="board__head">
        <h1 className="board__heading">{t('board.heading')}</h1>
        <span className="u-muted">
          {t('board.summary', {
            count: devices.length,
            inSession: countInSession(devices),
          })}
        </span>
      </header>

      {error && <div className="banner banner--error">{error}</div>}

      <div className="board__grid">
        {devices.map((device) => (
          <article
            key={device.id}
            className={`pouch-card${device.connected ? '' : ' pouch-card--offline'}`}
          >
            <header className="pouch-card__head">
              <strong>{device.id}</strong>
              <span className="u-muted">{device.label}</span>
              <span
                className={`pouch-card__dot pouch-card__dot--${
                  device.connected ? 'on' : 'off'
                }`}
              />
            </header>

            <div className="u-muted u-small">
              {device.transport}
              {device.port ? ` ${device.port}` : ''}
              {device.connected
                ? ` · ${t('units.rate', { value: device.rate_hz })}`
                : ` · ${t('board.offline')}`}
            </div>

            <div>
              {device.service_mode ? (
                <span className="pouch-card__badge pouch-card__badge--service">
                  {t('board.serviceMode')}
                </span>
              ) : device.patient ? (
                <>
                  <div className="pouch-card__patient-name">
                    {device.patient.full_name}
                  </div>
                  <div className="u-muted u-small">
                    {formatDuration(device.session_elapsed_s) ?? t('common.emDash')}
                  </div>
                </>
              ) : (
                <span className="u-muted">{t('board.noPatient')}</span>
              )}
            </div>

            <div className="pouch-card__zones">
              {device.zones.map((zone) => (
                <span
                  key={zone.zone}
                  className={`pouch-card__chip${
                    zone.status === 'OK' ? '' : ' pouch-card__chip--bad'
                  }`}
                  title={t('board.zoneTooltip', {
                    zone: t(`zones.${zone.zone}`),
                    status: t(`status.${zone.status}`),
                  })}
                >
                  {zoneChipLabel(zone.zone, zone.effective_mmhg)}
                </span>
              ))}
            </div>

            {device.alerts.length > 0 && (
              <span className="pouch-card__badge pouch-card__badge--alarm">
                {t('board.alerts', { count: device.alerts.length })}
              </span>
            )}

            <div className="pouch-card__actions">
              <Link className="btn" to={`/devices/${device.id}`}>
                {t('board.open')}
              </Link>
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => void toggleConnection(device)}
              >
                {device.connected ? t('board.disconnect') : t('board.connect')}
              </button>
            </div>
          </article>
        ))}
      </div>

      {devices.length === 0 && (
        <p className="u-muted">
          <Trans
            i18nKey="board.empty"
            components={{ 1: <Link to="/settings" /> }}
          />
        </p>
      )}
    </div>
  );
}
