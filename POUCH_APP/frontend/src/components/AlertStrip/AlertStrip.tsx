import { useTranslation } from 'react-i18next';

import { formatAlertTime, sortAlerts } from './AlertStrip.lib';
import type { AlertStripProps } from './AlertStrip.types';
import './AlertStrip.scss';

/**
 * Alerts persist until acknowledged and are written to the events table. They are
 * deliberately not toasts — a pressure fault that vanishes after three seconds is
 * a fault nobody saw.
 */
export function AlertStrip({ alerts, onAck }: AlertStripProps) {
  const { t, i18n } = useTranslation();

  if (alerts.length === 0) return null;

  return (
    <section className="alerts">
      <h2 className="alerts__title">{t('device.alerts.title')}</h2>

      <ul className="alerts__list">
        {sortAlerts(alerts).map((alert) => (
          <li key={alert.id} className={`alerts__item alerts__item--${alert.severity}`}>
            <span className="alerts__time">
              {formatAlertTime(alert.ts, i18n.language)}
            </span>
            <span className="alerts__code">{alert.code}</span>
            <span className="alerts__detail">{alert.detail}</span>
            <button
              type="button"
              className="btn btn--tiny"
              onClick={() => onAck(alert.id)}
            >
              {t('device.alerts.ack')}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
