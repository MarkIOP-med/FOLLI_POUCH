import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { Zone } from '@/api/types';
import { BUTTONS, PROFILE } from '@/domain/diagnosticsAssets';
import { STATUS_CLASS, fsrDisplay } from '@/domain/status';
import { parseTarget } from '@/domain/pressure';
import type { VNodeRowProps } from './VNodeRow.types';
import './VNodeRow.scss';

/**
 * One V-node in the telemetry array: zone-highlighted profile, editable target,
 * live actual, and both FSR channels.
 */
export function VNodeRow({ zone, gender, ceiling, disabled, onSet }: VNodeRowProps) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(String(zone.prescribed_mmhg));

  useEffect(() => setDraft(String(zone.prescribed_mmhg)), [zone.prescribed_mmhg]);

  const zoneKey = zone.zone as Zone;
  const left = fsrDisplay(zone.fsr_l);
  const right = fsrDisplay(zone.fsr_r);
  // An emptied field is not a command: clearing the box and tabbing away used to
  // send 0 mmHg and vent the pad. Reverting to the prescription is the only
  // non-surprising reading of an empty input.
  const commit = () => {
    if (draft.trim() === '') {
      setDraft(String(zone.prescribed_mmhg));
      return;
    }
    onSet(zoneKey, parseTarget(draft, ceiling));
  };

  const renderFsr = (d: ReturnType<typeof fsrDisplay>) => {
    if (d.kind === 'fault') {
      return <span className="vnode-row__fault">{t('status.fsrFault')}</span>;
    }
    if (d.kind === 'none') {
      return <span className="vnode-row__na">{t('common.notAvailable')}</span>;
    }
    return <span className="vnode-row__value">{d.value}</span>;
  };

  return (
    <article className={`vnode-row ${STATUS_CLASS[zone.status]}`}>
      <img
        className="vnode-row__profile"
        src={PROFILE[gender][zoneKey]}
        alt={t('zones.padAlt', { zone: t(`zones.${zone.zone}`) })}
      />

      <h3 className="vnode-row__title">{t(`zones.titles.${zone.zone}`)}</h3>
      <button
        type="button"
        className="vnode-row__set"
        disabled={disabled}
        onClick={commit}
      >
        <img src={BUTTONS.set} alt={t('diagnostics.regime.set')} />
      </button>

      <div className="vnode-row__line">
          <span>{t('device.vnodes.target')}</span>
          <input
            className="vnode-row__input"
            type="number"
            min={0}
            max={ceiling}
            value={draft}
            disabled={disabled}
            aria-label={t(`zones.titles.${zone.zone}`)}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => e.key === 'Enter' && commit()}
          />
          {/* One run, not four spans: the flex gap would otherwise be added at
              every word boundary on top of the natural spaces, pushing the row
              past the card's edge. */}
          <span>
            {t('common.mmhg')} | {t('device.vnodes.actual')}{' '}
            {/* The design sets the actual reading in plain white; colour is kept
                for the states that need attention rather than applied to every
                healthy channel. */}
            <span
              className={`vnode-row__value${
                zone.status === 'OK' ? '' : ` ${STATUS_CLASS[zone.status]}`
              }`}
            >
              {zone.actual_mmhg == null
                ? t('diagnostics.noData')
                : t('units.pressure', { value: zone.actual_mmhg })}
            </span>
          </span>
        </div>

      <div className="vnode-row__divider" />

      <div className="vnode-row__fsr">
        <span>
          <span className="vnode-row__side">{t('device.vnodes.fsrLeft')}</span>{' '}
          {renderFsr(left)} | <span className="vnode-row__side">
            {t('device.vnodes.fsrRight')}
          </span>{' '}
          {renderFsr(right)}
        </span>
      </div>
    </article>
  );
}
