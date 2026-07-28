import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { formatDuration } from '@/domain/status';
import { useClock } from './DeviceHeader.lib';
import type { DeviceHeaderProps } from './DeviceHeader.types';
import './DeviceHeader.scss';

/** Header chrome: title, link state, session runtime, console pairing, clock. */
export function DeviceHeader({ snapshot }: DeviceHeaderProps) {
  const { t, i18n } = useTranslation();
  const now = useClock();

  const runtime = formatDuration(snapshot.session_elapsed_s);

  return (
    <header className="device-header">
      <div className="device-header__top">
        <Link to="/" className="device-header__back" aria-label={t('common.back')}>
          ←
        </Link>
        <h1 className="device-header__title">
          {t('device.title')} <span className="device-header__id">{snapshot.id}</span>
        </h1>
        <span className="device-header__clock">
          {t('device.localizedTime', { time: now.toLocaleTimeString(i18n.language) })}
        </span>
      </div>

      <div className="device-header__meta">
        <span>
          {snapshot.transport === 'serial' ? t('device.serial') : t('device.link')}:{' '}
          <span
            className={`device-header__dot device-header__dot--${
              snapshot.connected ? 'on' : 'off'
            }`}
          />{' '}
          {snapshot.connected
            ? t('device.connectedWith', {
                transport: snapshot.port ?? snapshot.transport,
                rate: snapshot.rate_hz,
              })
            : t('device.disconnected')}
        </span>

        <span>
          {t('device.sessionRuntime', { value: runtime ?? t('common.emDash') })}
        </span>

        {/*
          The mock shows a connected console tablet. Nothing reports one yet: the
          console talks BLE to an ESP32, and the board on the bench is a Due with no
          radio. Shown as none paired rather than faked.
        */}
        <span>
          {t('device.console')}{' '}
          <span className="device-header__dot device-header__dot--off" />{' '}
          {t('device.consoleNonePaired')}
        </span>

        <span>
          {t('device.firmware', { version: snapshot.fw_version ?? t('common.unknown') })}
        </span>
      </div>
    </header>
  );
}
