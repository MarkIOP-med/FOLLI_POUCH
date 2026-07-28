import { useTranslation } from 'react-i18next';

import type { Zone } from '@/api/types';
import type { VibrationTableProps } from './VibrationTable.types';
import './VibrationTable.scss';

const LEVELS = [0, 1, 2, 3] as const;

/** Right column of the overview: massage level and duration per zone. */
export function VibrationTable({ zones, disabled, onSet }: VibrationTableProps) {
  const { t } = useTranslation();

  return (
    <section className="vibration">
      <h2 className="vibration__title">{t('device.vibration.title')}</h2>

      <table className="vibration__table">
        <thead>
          <tr>
            <th>{t('device.vibration.zonePair')}</th>
            <th>{t('device.vibration.levels')}</th>
            <th>{t('device.vibration.duration')}</th>
          </tr>
        </thead>
        <tbody>
          {zones.map((zone) => (
            <tr key={zone.zone}>
              <td className="vibration__zone">{t(`zones.${zone.zone}`)}</td>
              <td>
                {LEVELS.map((level) => (
                  <button
                    key={level}
                    type="button"
                    className={`level${zone.massage_level === level ? ' is-on' : ''}`}
                    disabled={disabled}
                    aria-pressed={zone.massage_level === level}
                    onClick={() => onSet(zone.zone as Zone, level)}
                  >
                    {level}
                  </button>
                ))}
              </td>
              <td className="vibration__duration">
                {t('units.duration', { value: zone.massage_seconds })}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/*
        The mock shows a live "Time Left" countdown. The firmware auto-times vibration
        out after VIBRATION_DURATION_MS but never reports the remaining time, so a
        countdown here would be a guess animated to look like a measurement.
      */}
      <p className="u-note">{t('device.vibration.note')}</p>
    </section>
  );
}
