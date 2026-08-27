import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { api } from '@/api/client';
import type { DeviceSnapshot } from '@/api/types';
import { FluidShell } from '@/components/FluidShell/FluidShell';
import { formatDuration } from '@/domain/status';
import { getLastDeviceId, setLastDeviceId } from '@/domain/lastDevice';
import { useRoster } from '@/domain/useRoster';
import './HomeScreen.scss';

/** PAGE_01 — home. One card per pouch, with its patient and session. */
export function HomeScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { devices, error: rosterError } = useRoster();
  const [connectingId, setConnectingId] = useState<string | null>(null);
  const [connectError, setConnectError] = useState<string | null>(null);

  useEffect(() => {
    if (!getLastDeviceId() && devices[0]) setLastDeviceId(devices[0].id);
  }, [devices]);

  /* ENTER on a disconnected pouch connects it first (a serial pouch resets on
     port-open and takes ~7s to boot), then navigates. */
  const enterDevice = async (device: DeviceSnapshot) => {
    setConnectError(null);
    setLastDeviceId(device.id);
    if (!device.connected) {
      setConnectingId(device.id);
      try {
        await api.connect(device.id);
      } catch (err) {
        setConnectError(err instanceof Error ? err.message : String(err));
        setConnectingId(null);
        return;
      }
      setConnectingId(null);
    }
    navigate(`/diagnostics/${device.id}`);
  };

  const noData = t('diagnostics.noData');
  const active = devices.filter((d) => d.session_id !== null).length;
  const lead = devices.find((d) => d.patient) ?? devices[0] ?? null;

  return (
    <FluidShell
      active="home"
      title={t('diagnostics.rail.home')}
      connected={lead?.connected ?? false}
      pouchId={lead?.id ?? null}
      patientName={lead?.patient?.full_name ?? null}
      sessionElapsedS={lead?.session_elapsed_s ?? null}
    >
      <div className="home">
        <div className="home__top">
          <h1 className="home__heading">{t('diagnostics.home.cardTitle')}s</h1>
          <span className="home__count">
            {t('diagnostics.home.activeUsers', { count: active })}
          </span>
        </div>

        {(connectError || rosterError) && (
          <p className="home__error">{connectError ?? rosterError}</p>
        )}

        <div className="home__grid">
          {devices.map((device, index) => (
            <article
              key={device.id}
              className={`home-card${device.id === lead?.id ? ' is-active' : ''}`}
            >
              <header className="home-card__head">
                <span>{t('diagnostics.home.cardTitle')}</span>
                <span className="home-card__num">
                  {String(index + 1).padStart(2, '0')}
                </span>
              </header>

              <dl className="home-card__body">
                <dt>{t('diagnostics.home.name')}</dt>
                <dd>{device.patient?.full_name ?? noData}</dd>
                <dt>{t('diagnostics.home.pouch')}</dt>
                <dd>
                  <span
                    className={`home-card__dot${device.connected ? ' is-on' : ' is-off'}`}
                  />
                  {device.id}
                </dd>
                <dt>{t('diagnostics.home.timeRemain')}</dt>
                <dd>{formatDuration(device.session_elapsed_s) ?? noData}</dd>
              </dl>

              <button
                type="button"
                className="home-card__enter"
                disabled={connectingId !== null}
                onClick={() => void enterDevice(device)}
              >
                {device.id === connectingId
                  ? t('device.connecting', { id: device.id })
                  : t('diagnostics.home.enter')}
              </button>
            </article>
          ))}

          {devices.length === 0 && !rosterError && (
            <article className="home-card home-card--empty">
              <p>No pouches registered yet. Add one in Admin.</p>
            </article>
          )}
        </div>
      </div>
    </FluidShell>
  );
}
